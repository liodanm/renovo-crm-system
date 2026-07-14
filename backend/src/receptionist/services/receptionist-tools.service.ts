import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Same tool-calling shape as the in-CRM AI Assistant (Anthropic Messages
 * API `tools` format), so the same Claude integration pattern used
 * elsewhere in Renovo works unchanged here — just a different set of tools
 * and a phone caller instead of a logged-in staff member on the other end.
 */
export const RECEPTIONIST_TOOLS = [
  {
    name: 'collect_customer_info',
    description: "Creates or finds a customer record from information collected during the call. Call this as soon as you have the caller's name and phone number, even before you know what they need.",
    input_schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        phone: { type: 'string', description: 'The caller\'s phone number, E.164 format if possible' },
        addressLine1: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        postalCode: { type: 'string' },
      },
      required: ['firstName', 'phone'],
    },
  },
  {
    name: 'schedule_estimate',
    description: 'Books a site-visit estimate appointment for a customer. Only call this after collect_customer_info has succeeded and you have a property address and a preferred date/time.',
    input_schema: {
      type: 'object',
      properties: {
        customerId: { type: 'string' },
        addressLine1: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        postalCode: { type: 'string' },
        preferredDateTimeIso: { type: 'string', description: 'ISO 8601 datetime for the estimate visit' },
        serviceInterest: { type: 'string', description: "What the caller is interested in, e.g. 'roof wash', 'driveway'" },
      },
      required: ['customerId', 'addressLine1', 'city', 'state', 'postalCode', 'preferredDateTimeIso'],
    },
  },
  {
    name: 'reschedule_job',
    description: "Moves an existing job to a new date/time. Look up the caller's job by their phone number first if you don't have a jobId.",
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: "Caller's phone number, used to find their upcoming job if jobId is unknown" },
        jobId: { type: 'string' },
        newDateTimeIso: { type: 'string' },
      },
      required: ['newDateTimeIso'],
    },
  },
  {
    name: 'answer_faq',
    description: 'Looks up a grounded answer from the company\'s real FAQ knowledge base — always use this rather than answering business-fact questions (pricing, hours, service area) from general knowledge.',
    input_schema: {
      type: 'object',
      properties: { topic: { type: 'string', description: 'Short search phrase for the question, e.g. "do you clean roofs" or "service area"' } },
      required: ['topic'],
    },
  },
  {
    name: 'transfer_to_owner',
    description: 'Transfers the call to the business owner. Use for anything outside a simple estimate booking/reschedule/FAQ — angry callers, large commercial jobs, price negotiation, or when explicitly asked for a person.',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      required: ['reason'],
    },
  },
];

export interface ReceptionistToolContext {
  companyId: string;
  callId: string;
}

@Injectable()
export class ReceptionistToolsService {
  private readonly logger = new Logger(ReceptionistToolsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(toolName: string, input: any, ctx: ReceptionistToolContext): Promise<any> {
    switch (toolName) {
      case 'collect_customer_info':
        return this.collectCustomerInfo(input, ctx);
      case 'schedule_estimate':
        return this.scheduleEstimate(input, ctx);
      case 'reschedule_job':
        return this.rescheduleJob(input, ctx);
      case 'answer_faq':
        return this.answerFaq(input, ctx);
      case 'transfer_to_owner':
        return { success: true, action: 'transfer', reason: input.reason };
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private async collectCustomerInfo(input: any, ctx: ReceptionistToolContext) {
    // Match by phone within the tenant first — a repeat caller shouldn't
    // get a duplicate customer record every time they call.
    const existing = await this.prisma.customer.findFirst({
      where: { companyId: ctx.companyId, phone: input.phone, deletedAt: null },
    });
    if (existing) {
      await this.prisma.call.update({ where: { id: ctx.callId }, data: { customerId: existing.id } });
      return { success: true, customerId: existing.id, isNewCustomer: false, name: `${existing.firstName ?? ''} ${existing.lastName ?? ''}`.trim() };
    }

    const created = await this.prisma.customer.create({
      data: {
        companyId: ctx.companyId,
        customerType: 'residential',
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        source: 'phone_call',
        leadStatus: 'lead',
      },
    });
    await this.prisma.call.update({ where: { id: ctx.callId }, data: { customerId: created.id } });
    return { success: true, customerId: created.id, isNewCustomer: true };
  }

  private async scheduleEstimate(input: any, ctx: ReceptionistToolContext) {
    const customer = await this.prisma.customer.findFirst({ where: { id: input.customerId, companyId: ctx.companyId } });
    if (!customer) return { success: false, error: 'Customer not found — call collect_customer_info first' };

    const property = await this.prisma.property.create({
      data: {
        companyId: ctx.companyId,
        customerId: customer.id,
        addressLine1: input.addressLine1,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
      },
    });

    const start = new Date(input.preferredDateTimeIso);
    const end = new Date(start.getTime() + 30 * 60 * 1000); // 30-min estimate visit

    const jobNumber = `JOB-${Date.now().toString().slice(-6)}`;
    const job = await this.prisma.job.create({
      data: {
        companyId: ctx.companyId,
        customerId: customer.id,
        propertyId: property.id,
        jobNumber,
        title: `Estimate visit${input.serviceInterest ? ` — ${input.serviceInterest}` : ''}`,
        status: 'scheduled',
        scheduledStart: start,
        scheduledEnd: end,
        price: 0,
      },
    });

    await this.prisma.call.update({
      where: { id: ctx.callId },
      data: { outcome: 'estimate_scheduled' },
    });

    return { success: true, jobId: job.id, scheduledStart: start.toISOString(), address: `${input.addressLine1}, ${input.city}` };
  }

  private async rescheduleJob(input: any, ctx: ReceptionistToolContext) {
    let job = input.jobId
      ? await this.prisma.job.findFirst({ where: { id: input.jobId, companyId: ctx.companyId } })
      : null;

    if (!job && input.phone) {
      const customer = await this.prisma.customer.findFirst({ where: { companyId: ctx.companyId, phone: input.phone } });
      if (customer) {
        job = await this.prisma.job.findFirst({
          where: { companyId: ctx.companyId, customerId: customer.id, status: 'scheduled', scheduledStart: { gte: new Date() } },
          orderBy: { scheduledStart: 'asc' },
        });
      }
    }

    if (!job) return { success: false, error: 'No upcoming job found for this caller' };

    const newStart = new Date(input.newDateTimeIso);
    const duration = job.scheduledEnd ? job.scheduledEnd.getTime() - (job.scheduledStart?.getTime() ?? newStart.getTime()) : 30 * 60 * 1000;
    const newEnd = new Date(newStart.getTime() + duration);

    await this.prisma.job.update({ where: { id: job.id }, data: { scheduledStart: newStart, scheduledEnd: newEnd } });
    await this.prisma.call.update({ where: { id: ctx.callId }, data: { outcome: 'job_rescheduled', customerId: job.customerId } });

    return { success: true, jobId: job.id, newScheduledStart: newStart.toISOString() };
  }

  private async answerFaq(input: any, ctx: ReceptionistToolContext) {
    // Simple keyword relevance over the company's real FAQ entries — good
    // enough at the scale of a small business FAQ list (dozens of entries,
    // not thousands); an embeddings-based search is the natural upgrade if
    // that ever stops being true, same tradeoff noted in the AI
    // architecture doc for other search surfaces in Renovo.
    const entries = await this.prisma.faqEntry.findMany({ where: { companyId: ctx.companyId, isActive: true } });
    const queryWords = this.tokenize(input.topic || '');

    const scored = entries
      .map((e) => {
        const haystackWords = new Set(this.tokenize(e.question));
        const score = queryWords.filter((w) => haystackWords.has(w)).length;
        return { entry: e, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      await this.prisma.call.update({ where: { id: ctx.callId }, data: { outcome: 'no_action' } });
      return { success: false, found: false, message: 'No matching FAQ entry — offer to have the owner follow up, or transfer.' };
    }

    await this.prisma.call.update({ where: { id: ctx.callId }, data: { outcome: 'faq_answered' } });
    return { success: true, found: true, answer: scored[0].entry.answer };
  }

  /**
   * Tokenizes into real whole words and drops common function words — a
   * naive substring `.includes()` match would let a query word like "you"
   * spuriously match ANY question containing "you" (e.g. "Do **you** clean
   * roofs?"), regardless of what the caller actually asked about.
   */
  private static readonly STOPWORDS = new Set([
    'the', 'you', 'your', 'and', 'for', 'are', 'does', 'do', 'is', 'what', 'how', 'can', 'with', 'about', 'that', 'this', 'have', 'has',
  ]);

  private tokenize(text: string): string[] {
    return (text.toLowerCase().match(/[a-z0-9']+/g) || []).filter((w) => w.length > 2 && !ReceptionistToolsService.STOPWORDS.has(w));
  }
}
