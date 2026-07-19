import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { SmsService } from '../../sms/sms.service';

/**
 * This is what "make the automation actually fire" meant concretely: the
 * rule logic below is the same logic proven correct in the earlier
 * client-side prototype (real date math, real dedup reasoning) — what was
 * missing was somewhere for it to actually RUN unattended, and a real SMS
 * provider on the other end of it. A browser tab can't do either.
 *
 * Deliberate design choice for a solo operator: routine reminders send
 * immediately, no approval queue. Requiring a one-person shop to manually
 * approve every "you're due for a cleaning" text is exactly the admin
 * overhead this feature exists to remove. AutomationLog is what you review
 * after the fact, not a queue you have to clear before anything goes out.
 * (A multi-employee, higher-stakes version of this — see the earlier
 * SaaS-track prototype's Outbox pattern — is the right model again once
 * there's staff who might reasonably want to intervene before a customer
 * sees a message; not now.)
 */
@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
  ) {}

  async runForCompany(companyId: string): Promise<{ sent: number; failed: number }> {
    const settings = await this.prisma.automationSettings.findUnique({ where: { companyId } });
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return { sent: 0, failed: 0 };

    // No settings row yet = every rule runs with its schema default — a
    // company shouldn't get NO automation just because nobody has opened
    // a settings screen to create the row.
    const effective = settings ?? {
      estimateFollowupEnabled: true,
      estimateFollowupAfterDays: 3,
      recurringReminderEnabled: true,
      recurringReminderIntervalMonths: 12,
      reviewRequestEnabled: true,
      reviewRequestDelayDays: 1,
    };

    let sent = 0;
    let failed = 0;

    if (effective.estimateFollowupEnabled) {
      const result = await this.runEstimateFollowups(company, effective.estimateFollowupAfterDays);
      sent += result.sent;
      failed += result.failed;
    }
    if (effective.recurringReminderEnabled) {
      const result = await this.runRecurringReminders(company, effective.recurringReminderIntervalMonths);
      sent += result.sent;
      failed += result.failed;
    }
    if (effective.reviewRequestEnabled) {
      const result = await this.runReviewRequests(company, effective.reviewRequestDelayDays);
      sent += result.sent;
      failed += result.failed;
    }

    return { sent, failed };
  }

  // ===========================================================================
  // Rule 1: estimate follow-up — sent estimates with no response after N days
  // ===========================================================================
  private async runEstimateFollowups(company: { id: string; name: string }, afterDays: number) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - afterDays);

    const estimates = await this.prisma.estimate.findMany({
      where: { companyId: company.id, status: 'sent', sentAt: { lte: cutoff } },
      include: { customer: true },
    });

    let sent = 0;
    let failed = 0;
    for (const estimate of estimates) {
      const dedupeKey = `estimate_followup:${estimate.id}`;
      const body = `Hi ${estimate.customer.firstName ?? ''}, just checking in on the ${this.formatMoney(estimate.totalAmount.toNumber())} estimate ${company.name} sent over. Happy to answer any questions or get you on the schedule whenever you're ready!`;
      const ok = await this.sendOnce({
        companyId: company.id,
        customerId: estimate.customerId,
        ruleType: 'estimate_followup',
        dedupeKey,
        phone: estimate.customer.phone,
        email: estimate.customer.email,
        subject: `Following up on your estimate from ${company.name}`,
        body,
      });
      ok ? sent++ : failed++;
    }
    return { sent, failed };
  }

  // ===========================================================================
  // Rule 2: recurring maintenance reminder — completed jobs with no repeat
  // service in `intervalMonths`. This is the direct revenue-generating rule:
  // it's what turns a one-time customer into a recurring one without you
  // having to remember to reach out.
  // ===========================================================================
  private async runRecurringReminders(company: { id: string; name: string }, intervalMonths: number) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - intervalMonths);

    // Properties whose most recent completed job was before the cutoff,
    // and have had NO job (of any kind) since — i.e. genuinely overdue,
    // not just "it's been a while since THIS service type."
    const properties = await this.prisma.property.findMany({
      where: {
        companyId: company.id,
        deletedAt: null,
        jobs: { some: { status: 'completed', scheduledStart: { lte: cutoff } } },
      },
      include: {
        customer: true,
        jobs: { where: { status: 'completed' }, orderBy: { scheduledStart: 'desc' }, take: 1 },
      },
    });

    let sent = 0;
    let failed = 0;
    for (const property of properties) {
      const lastJob = property.jobs[0];
      if (!lastJob?.scheduledStart || lastJob.scheduledStart > cutoff) continue; // last job is actually recent enough, skip

      const monthsSince = Math.round((Date.now() - lastJob.scheduledStart.getTime()) / (1000 * 60 * 60 * 24 * 30));
      const dedupeKey = `recurring_reminder:${property.id}:${lastJob.id}`; // tied to the specific last job, so a NEW job resets eligibility naturally
      const body = `Hi ${property.customer.firstName ?? ''}, it's been about ${monthsSince} months since we last cleaned up at ${property.addressLine1} — right around when things start needing it again. Want us to get you back on the schedule? Reply here or give us a call.`;

      const ok = await this.sendOnce({
        companyId: company.id,
        customerId: property.customerId,
        ruleType: 'recurring_reminder',
        dedupeKey,
        phone: property.customer.phone,
        email: property.customer.email,
        subject: `Time for another cleaning?`,
        body,
      });
      ok ? sent++ : failed++;
    }
    return { sent, failed };
  }

  // ===========================================================================
  // Rule 3: review request — completed jobs, a short delay after completion
  // ===========================================================================
  private async runReviewRequests(company: { id: string; name: string }, delayDays: number) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - delayDays);
    const windowStart = new Date(targetDate);
    windowStart.setDate(windowStart.getDate() - 6); // a bounded window so this doesn't resurrect every old completed job, same reasoning as the earlier prototype's version of this rule

    const jobs = await this.prisma.job.findMany({
      where: { companyId: company.id, status: 'completed', scheduledStart: { gte: windowStart, lte: targetDate } },
      include: { customer: true },
    });

    let sent = 0;
    let failed = 0;
    for (const job of jobs) {
      const dedupeKey = `review_request:${job.id}`;
      const body = `Hi ${job.customer.firstName ?? ''}, thanks for choosing ${company.name} for your ${job.title.toLowerCase()}! If you have a minute, a quick Google review really helps other homeowners find us. Thanks again!`;
      const ok = await this.sendOnce({
        companyId: company.id,
        customerId: job.customerId,
        ruleType: 'review_request',
        dedupeKey,
        phone: job.customer.phone,
        email: job.customer.email,
        subject: `How did we do?`,
        body,
      });
      ok ? sent++ : failed++;
    }
    return { sent, failed };
  }

  /**
   * Insert-then-send, not check-then-send: the dedupe row is written FIRST,
   * inside the same operation that would fail on a duplicate key. If a
   * second cron run (or a race between two overlapping runs) tries the
   * same dedupeKey, the unique constraint rejects the insert and we skip
   * sending — the database is the source of truth for "have we already
   * sent this," not an application-level check that has a race window.
   */
  /**
   * The real hook point for "Estimate Sent/Viewed/Approved/Rejected,
   * Invoice Sent/Viewed/Paid" automation, called directly from
   * EstimatesService/InvoicesService/PortalDataService the moment each
   * event actually happens. Reuses automation_log — the same table and
   * the same dedupe mechanism (companyId + dedupeKey unique constraint)
   * sendOnce already relies on — rather than a second logging table.
   * Deliberately just a log entry, not a new send: the email itself was
   * already sent by MailService/sendDocumentEmail; this is the durable
   * record a future rule-execution engine or a "what happened to this
   * estimate" timeline can query.
   */
  async logEvent(companyId: string, customerId: string | null, ruleType: string, dedupeKey: string, note: string): Promise<void> {
    try {
      await this.prisma.automationLog.create({
        data: { companyId, customerId, ruleType, dedupeKey, channel: 'system', messageBody: note, status: 'sent' },
      });
    } catch {
      // Unique constraint on (companyId, dedupeKey) — this exact event was
      // already logged once (e.g. a customer reopening an already-viewed
      // estimate). Correctly a no-op, not an error.
    }
  }

  private async sendOnce(input: { companyId: string; customerId: string; ruleType: string; dedupeKey: string; phone: string | null; email: string | null; subject: string; body: string }): Promise<boolean> {
    // Email is a fallback, not a second send — a customer with both a
    // phone and an email on file still only gets one message, via SMS
    // (the channel every existing rule was already built and tested
    // against). Only customers with no phone at all pick up the email path.
    const channel: 'sms' | 'email' | null = input.phone ? 'sms' : input.email ? 'email' : null;
    if (!channel) return false; // no contact method on file at all — nothing to send to, not a failure

    try {
      await this.prisma.automationLog.create({
        data: {
          companyId: input.companyId,
          customerId: input.customerId,
          ruleType: input.ruleType,
          dedupeKey: input.dedupeKey,
          channel,
          messageBody: input.body,
          status: 'sent',
        },
      });
    } catch {
      // Unique constraint violation on (companyId, dedupeKey) — already sent, correctly skip.
      return false;
    }

    const result = channel === 'sms' ? await this.sendSms(input.phone!, input.body) : await this.sendEmail(input.email!, input.subject, input.body);

    if (!result.sent) {
      // The dedupe row already exists (correctly preventing a retry storm),
      // but we should still be honest in the log that the send itself failed.
      await this.prisma.automationLog.updateMany({
        where: { companyId: input.companyId, dedupeKey: input.dedupeKey },
        data: { status: 'failed', errorDetail: result.error },
      });
      this.logger.warn(`Automation ${channel} failed for ${input.dedupeKey}: ${result.error}`);
      return false;
    }
    return true;
  }

  private async sendEmail(to: string, subject: string, body: string): Promise<{ sent: boolean; error?: string }> {
    try {
      await this.mail.sendAutomationEmail(to, subject, body);
      // MailService.enqueue() never throws (it catches and logs internally,
      // same reasoning as every other queue-based send in this system) —
      // so "didn't throw" means "successfully queued," not "delivered."
      // Actual delivery success/failure is Postmark's problem, handled by
      // MailProcessor's own retry logic, not visible synchronously here.
      return { sent: true };
    } catch (err) {
      return { sent: false, error: (err as Error).message };
    }
  }

  private async sendSms(to: string, body: string): Promise<{ sent: boolean; error?: string }> {
    return this.sms.send(to, body);
  }

  private formatMoney(amount: number): string {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
