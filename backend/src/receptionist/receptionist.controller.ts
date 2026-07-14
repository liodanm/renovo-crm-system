import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, Patch, Post, Delete, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';
import { TwimlBuilderService } from './services/twiml-builder.service';
import { TwilioSignatureService } from './services/twilio-signature.service';
import { BusinessHoursService, BusinessHours } from './services/business-hours.service';
import { TwilioSmsService } from './services/twilio-sms.service';
import { CallSummaryService } from './services/call-summary.service';
import { CreateFaqEntryDto, UpdateFaqEntryDto } from './dto/faq-entry.dto';
import { UpdateReceptionistSettingsDto } from './dto/receptionist-settings.dto';

@Controller()
export class ReceptionistController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly twiml: TwimlBuilderService,
    private readonly signatures: TwilioSignatureService,
    private readonly businessHours: BusinessHoursService,
    private readonly sms: TwilioSmsService,
    private readonly summaries: CallSummaryService,
  ) {}

  // ===========================================================================
  // Twilio webhooks — PUBLIC (no JWT; Twilio isn't a logged-in user), but every
  // one validates X-Twilio-Signature before doing anything with the payload.
  // ===========================================================================

  @Public()
  @Post('twilio/voice/incoming')
  async handleIncomingCall(@Req() req: Request, @Res() res: Response, @Headers('x-twilio-signature') signature?: string) {
    this.assertValidTwilioRequest(req, signature);

    const toNumber = req.body.To as string;
    const fromNumber = req.body.From as string;
    const callSid = req.body.CallSid as string;

    // A Twilio webhook has no JWT/tenant context — the ONLY way to know
    // which company this call belongs to is the phone number it was dialed
    // on, which is exactly why ReceptionistSettings.twilioPhoneNumber exists.
    const settings = await this.prisma.receptionistSettings.findFirst({ where: { twilioPhoneNumber: toNumber, isEnabled: true } });
    if (!settings) {
      res.set('Content-Type', 'text/xml');
      return res.send(this.twiml.buildHangup('Sorry, this number is not currently accepting calls.'));
    }

    await this.prisma.call.create({
      data: {
        companyId: settings.companyId,
        twilioCallSid: callSid,
        direction: 'inbound',
        fromNumber,
        toNumber,
        status: 'in_progress',
      },
    });

    const isOpen = this.businessHours.isOpenNow(settings.businessHours as unknown as BusinessHours);
    const baseUrl = this.config.get<string>('PUBLIC_API_BASE_URL', 'https://api.renovocrm.com');

    res.set('Content-Type', 'text/xml');
    if (!isOpen) {
      return res.send(
        this.twiml.buildAfterHours({
          closedMessage: `Thanks for calling! We're currently closed.`,
          voicemailEnabled: settings.voicemailEnabled,
          recordingStatusCallbackUrl: `${baseUrl}/twilio/voice/recording-status`,
        }),
      );
    }

    return res.send(
      this.twiml.buildConnectToAgent({
        relayWebSocketUrl: `wss://${new URL(baseUrl).host}/twilio/voice/relay?callSid=${encodeURIComponent(callSid)}`,
        welcomeGreeting: settings.greeting,
        recordingDisclosure: settings.recordingDisclosure,
      }),
    );
  }

  @Public()
  @Post('twilio/voice/status')
  async handleCallStatus(@Req() req: Request, @Res() res: Response, @Headers('x-twilio-signature') signature?: string) {
    this.assertValidTwilioRequest(req, signature);

    const callSid = req.body.CallSid as string;
    const callStatus = req.body.CallStatus as string; // 'completed', 'busy', 'no-answer', etc.
    const call = await this.prisma.call.findUnique({ where: { twilioCallSid: callSid } });
    if (!call) return res.status(200).send('ok'); // unknown call — nothing to do, still 200 so Twilio doesn't retry

    const updated = await this.prisma.call.update({
      where: { id: call.id },
      data: {
        status: callStatus === 'completed' ? 'completed' : call.status,
        endedAt: new Date(),
        durationSeconds: req.body.CallDuration ? Number(req.body.CallDuration) : undefined,
      },
    });

    // Summarization runs async and must never block Twilio's webhook —
    // Twilio expects a fast 200 response and will retry on timeout, which
    // would create duplicate work here.
    if (callStatus === 'completed' && updated.transcript) {
      this.summaries
        .summarize(updated.transcript as any)
        .then((result) => {
          if (!result) return;
          return this.prisma.call.update({
            where: { id: updated.id },
            data: { summary: result.summary, summaryStructured: result as any },
          });
        })
        .catch(() => {}); // logged inside CallSummaryService; a failed summary shouldn't crash anything
    }

    return res.status(200).send('ok');
  }

  @Public()
  @Post('twilio/voice/recording-status')
  async handleRecordingStatus(@Req() req: Request, @Res() res: Response, @Headers('x-twilio-signature') signature?: string) {
    this.assertValidTwilioRequest(req, signature);

    const callSid = req.body.CallSid as string;
    const call = await this.prisma.call.findUnique({ where: { twilioCallSid: callSid } });
    if (call) {
      await this.prisma.call.update({
        where: { id: call.id },
        data: { recordingUrl: req.body.RecordingUrl, recordingSid: req.body.RecordingSid, status: 'voicemail' },
      });
    }
    return res.status(200).send('ok');
  }

  private assertValidTwilioRequest(req: Request, signature: string | undefined) {
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!authToken) throw new ForbiddenException('Twilio not configured');

    const baseUrl = this.config.get<string>('PUBLIC_API_BASE_URL', '');
    const fullUrl = `${baseUrl}${req.originalUrl}`;

    const isValid = this.signatures.validate({ authToken, url: fullUrl, params: req.body, signatureHeader: signature });
    if (!isValid) throw new ForbiddenException('Invalid Twilio signature');
  }

  // ===========================================================================
  // Settings & FAQ management — normal authenticated CRM endpoints
  // ===========================================================================

  @Get('receptionist/settings')
  async getSettings(@CurrentUser() user: AuthenticatedRequestUser) {
    const settings = await this.prisma.receptionistSettings.findUnique({ where: { companyId: user.companyId } });
    return settings ?? { isEnabled: false, companyId: user.companyId };
  }

  @RequirePermissions('settings.manage')
  @Patch('receptionist/settings')
  async updateSettings(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: UpdateReceptionistSettingsDto) {
    return this.prisma.receptionistSettings.upsert({
      where: { companyId: user.companyId },
      create: { companyId: user.companyId, businessHours: {} as any, ...dto } as any,
      update: dto as any,
    });
  }

  @Get('receptionist/faq')
  listFaq(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.prisma.faqEntry.findMany({ where: { companyId: user.companyId }, orderBy: { sortOrder: 'asc' } });
  }

  @RequirePermissions('settings.manage')
  @Post('receptionist/faq')
  createFaq(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: CreateFaqEntryDto) {
    return this.prisma.faqEntry.create({ data: { companyId: user.companyId, ...dto } });
  }

  @RequirePermissions('settings.manage')
  @Patch('receptionist/faq/:id')
  async updateFaq(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string, @Body() dto: UpdateFaqEntryDto) {
    const entry = await this.prisma.faqEntry.findFirst({ where: { id, companyId: user.companyId } });
    if (!entry) throw new BadRequestException('FAQ entry not found');
    return this.prisma.faqEntry.update({ where: { id }, data: dto });
  }

  @RequirePermissions('settings.manage')
  @Delete('receptionist/faq/:id')
  async deleteFaq(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    const entry = await this.prisma.faqEntry.findFirst({ where: { id, companyId: user.companyId } });
    if (!entry) throw new BadRequestException('FAQ entry not found');
    await this.prisma.faqEntry.delete({ where: { id } });
    return { message: 'FAQ entry deleted' };
  }

  @Get('receptionist/calls')
  listCalls(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.prisma.call.findMany({ where: { companyId: user.companyId }, orderBy: { startedAt: 'desc' }, take: 100 });
  }

  @Get('receptionist/calls/:id')
  async getCall(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') id: string) {
    const call = await this.prisma.call.findFirst({ where: { id, companyId: user.companyId } });
    if (!call) throw new BadRequestException('Call not found');
    return call;
  }
}
