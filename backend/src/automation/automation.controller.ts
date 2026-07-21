import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedRequestUser } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../common/prisma/prisma.service';
import { AutomationService } from './services/automation.service';
import { UpdateAutomationSettingsDto } from './dto/automation-settings.dto';

@Controller('automation')
export class AutomationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automation: AutomationService,
  ) {}

  @Get('settings')
  async getSettings(@CurrentUser() user: AuthenticatedRequestUser) {
    const settings = await this.prisma.automationSettings.findUnique({ where: { companyId: user.companyId } });
    // Same "no row yet = defaults" reasoning as AutomationService itself —
    // this is what the settings screen shows before anyone's touched it.
    return (
      settings ?? {
        companyId: user.companyId,
        estimateFollowupEnabled: true,
        estimateFollowupAfterDays: 3,
        recurringReminderEnabled: true,
        recurringReminderIntervalMonths: 12,
        reviewRequestEnabled: true,
        reviewRequestDelayDays: 1,
        paymentReminderEnabled: true,
        paymentReminderDaysAfterDue: 3,
        estimateExpirationReminderEnabled: true,
        estimateExpirationReminderDaysBefore: 2,
        jobThankYouEnabled: true,
        templates: {},
      }
    );
  }

  @Patch('settings')
  async updateSettings(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: UpdateAutomationSettingsDto) {
    return this.prisma.automationSettings.upsert({
      where: { companyId: user.companyId },
      create: { companyId: user.companyId, ...dto },
      update: dto,
    });
  }

  @Get('log')
  getLog(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.prisma.automationLog.findMany({
      where: { companyId: user.companyId },
      orderBy: { sentAt: 'desc' },
      take: 100,
    });
  }

  /**
   * "See sent messages and results" scoped to one customer — the log
   * endpoint above is company-wide; this is what a customer's profile
   * page actually needs: everything this system has sent THIS person,
   * newest first, so you can answer "did we already remind them" without
   * guessing.
   */
  @Get('customers/:id/history')
  getCustomerHistory(@CurrentUser() user: AuthenticatedRequestUser, @Param('id') customerId: string) {
    return this.prisma.automationLog.findMany({
      where: { companyId: user.companyId, customerId },
      orderBy: { sentAt: 'desc' },
    });
  }

  /**
   * Lets you trigger a run on demand — e.g. right after configuring
   * settings for the first time, instead of waiting until 9am tomorrow to
   * see whether it's actually working. Real production use still relies on
   * the daily cron; this is a manual override, not the primary trigger.
   */
  @Post('run-now')
  async runNow(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.automation.runForCompany(user.companyId);
  }
}
