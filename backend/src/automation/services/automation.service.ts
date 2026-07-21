import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { SmsService } from '../../sms/sms.service';
import { EstimatesService } from '../../estimates/services/estimates.service';

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
    private readonly estimates: EstimatesService,
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
      paymentReminderEnabled: true,
      paymentReminderDaysAfterDue: 3,
      estimateExpirationReminderEnabled: true,
      estimateExpirationReminderDaysBefore: 2,
      jobThankYouEnabled: true,
      templates: {} as Record<string, { subject?: string; body?: string }>,
    };
    const templates = (effective.templates ?? {}) as Record<string, { subject?: string; body?: string }>;

    let sent = 0;
    let failed = 0;

    // Always runs, unlike the six rules below — this is a data-
    // correctness transition (an estimate genuinely IS expired once its
    // valid_until passes), not an optional reminder someone might
    // reasonably want off. Runs first, so every rule after it sees the
    // corrected status rather than a stale 'sent'/'viewed'.
    await this.runEstimateExpiration(company);

    if (effective.estimateFollowupEnabled) {
      const result = await this.runEstimateFollowups(company, effective.estimateFollowupAfterDays, templates.estimate_followup);
      sent += result.sent;
      failed += result.failed;
    }
    if (effective.recurringReminderEnabled) {
      const result = await this.runRecurringReminders(company, effective.recurringReminderIntervalMonths, templates.recurring_reminder);
      sent += result.sent;
      failed += result.failed;
    }
    if (effective.reviewRequestEnabled) {
      const result = await this.runReviewRequests(company, effective.reviewRequestDelayDays, templates.review_request);
      sent += result.sent;
      failed += result.failed;
    }
    if (effective.paymentReminderEnabled) {
      const result = await this.runPaymentReminders(company, effective.paymentReminderDaysAfterDue, templates.payment_reminder);
      sent += result.sent;
      failed += result.failed;
    }
    if (effective.estimateExpirationReminderEnabled) {
      const result = await this.runEstimateExpirationReminders(company, effective.estimateExpirationReminderDaysBefore, templates.estimate_expiration_reminder);
      sent += result.sent;
      failed += result.failed;
    }
    if (effective.jobThankYouEnabled) {
      const result = await this.runJobThankYous(company, templates.job_thank_you);
      sent += result.sent;
      failed += result.failed;
    }

    return { sent, failed };
  }

  // ===========================================================================
  // Rule 1: estimate follow-up — sent estimates with no response after N days
  // ===========================================================================
  private async runEstimateFollowups(company: { id: string; name: string }, afterDays: number, template?: { subject?: string; body?: string }) {
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
      const defaultBody = `Hi ${estimate.customer.firstName ?? ''}, just checking in on the ${this.formatMoney(estimate.totalAmount.toNumber())} estimate ${company.name} sent over. Happy to answer any questions or get you on the schedule whenever you're ready!`;
      const ok = await this.sendOnce({
        companyId: company.id,
        customerId: estimate.customerId,
        ruleType: 'estimate_followup',
        dedupeKey,
        phone: estimate.customer.phone,
        email: estimate.customer.email,
        subject: template?.subject || `Following up on your estimate from ${company.name}`,
        body: template?.body || defaultBody,
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
  private async runRecurringReminders(company: { id: string; name: string }, intervalMonths: number, template?: { subject?: string; body?: string }) {
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
      const defaultBody = `Hi ${property.customer.firstName ?? ''}, it's been about ${monthsSince} months since we last cleaned up at ${property.addressLine1} — right around when things start needing it again. Want us to get you back on the schedule? Reply here or give us a call.`;

      const ok = await this.sendOnce({
        companyId: company.id,
        customerId: property.customerId,
        ruleType: 'recurring_reminder',
        dedupeKey,
        phone: property.customer.phone,
        email: property.customer.email,
        subject: template?.subject || `Time for another cleaning?`,
        body: template?.body || defaultBody,
      });
      ok ? sent++ : failed++;
    }
    return { sent, failed };
  }

  // ===========================================================================
  // Rule 3: review request — completed jobs, a short delay after completion
  // ===========================================================================
  private async runReviewRequests(company: { id: string; name: string }, delayDays: number, template?: { subject?: string; body?: string }) {
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
      const defaultBody = `Hi ${job.customer.firstName ?? ''}, thanks for choosing ${company.name} for your ${job.title.toLowerCase()}! If you have a minute, a quick Google review really helps other homeowners find us. Thanks again!`;
      const ok = await this.sendOnce({
        companyId: company.id,
        customerId: job.customerId,
        ruleType: 'review_request',
        dedupeKey,
        phone: job.customer.phone,
        email: job.customer.email,
        subject: template?.subject || `How did we do?`,
        body: template?.body || defaultBody,
      });
      ok ? sent++ : failed++;
    }
    return { sent, failed };
  }

  // ===========================================================================
  // Rule 4: payment reminder — unpaid/partial invoices past their due date.
  // Same real business reasoning as recurring reminders: this is money
  // already earned, just not yet collected, and a one-person shop is the
  // one most likely to simply forget to chase it.
  // ===========================================================================
  private async runPaymentReminders(company: { id: string; name: string }, daysAfterDue: number, template?: { subject?: string; body?: string }) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysAfterDue);

    const invoices = await this.prisma.invoice.findMany({
      where: { companyId: company.id, status: { in: ['sent', 'partial'] }, dueDate: { lte: cutoff } },
      include: { customer: true },
    });

    let sent = 0;
    let failed = 0;
    for (const invoice of invoices) {
      const balance = invoice.totalAmount.toNumber() - invoice.amountPaid.toNumber();
      if (balance <= 0) continue;
      const dedupeKey = `payment_reminder:${invoice.id}`;
      const defaultBody = `Hi ${invoice.customer.firstName ?? ''}, a friendly reminder that invoice ${invoice.invoiceNumber} from ${company.name} (${this.formatMoney(balance)} due) is now past due. Let us know if you have any questions — happy to help however's easiest.`;
      const ok = await this.sendOnce({
        companyId: company.id,
        customerId: invoice.customerId,
        ruleType: 'payment_reminder',
        dedupeKey,
        phone: invoice.customer.phone,
        email: invoice.customer.email,
        subject: template?.subject || `Reminder: Invoice ${invoice.invoiceNumber} is past due`,
        body: template?.body || defaultBody,
      });
      ok ? sent++ : failed++;
    }
    return { sent, failed };
  }

  // ===========================================================================
  // Rule 5: estimate expiration reminder — sent/viewed estimates about to
  // hit valid_until. A nudge before it lapses, distinct from the
  // followup rule above (which fires once, early, regardless of expiration).
  // ===========================================================================
  private async runEstimateExpirationReminders(company: { id: string; name: string }, daysBefore: number, template?: { subject?: string; body?: string }) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBefore);
    const windowEnd = new Date(targetDate);
    windowEnd.setDate(windowEnd.getDate() + 1); // a same-day window around the target, not "everything expiring from now until then"

    const estimates = await this.prisma.estimate.findMany({
      where: { companyId: company.id, status: { in: ['sent', 'viewed'] }, validUntil: { gte: targetDate, lt: windowEnd } },
      include: { customer: true },
    });

    let sent = 0;
    let failed = 0;
    for (const estimate of estimates) {
      const dedupeKey = `estimate_expiration_reminder:${estimate.id}`;
      const defaultBody = `Hi ${estimate.customer.firstName ?? ''}, just a heads up that your ${this.formatMoney(estimate.totalAmount.toNumber())} estimate from ${company.name} expires soon. Let us know if you'd like to move forward before it does!`;
      const ok = await this.sendOnce({
        companyId: company.id,
        customerId: estimate.customerId,
        ruleType: 'estimate_expiration_reminder',
        dedupeKey,
        phone: estimate.customer.phone,
        email: estimate.customer.email,
        subject: template?.subject || `Your estimate from ${company.name} expires soon`,
        body: template?.body || defaultBody,
      });
      ok ? sent++ : failed++;
    }
    return { sent, failed };
  }

  // ===========================================================================
  // Rule 6: job thank-you — fires once, right after a job is marked
  // completed. Deliberately separate from the review request (which has
  // its own delay so it doesn't compete with this for attention) — this
  // one is immediate and simple, not asking for anything.
  // ===========================================================================
  private async runJobThankYous(company: { id: string; name: string }, template?: { subject?: string; body?: string }) {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 1); // completed within the last day — this rule runs daily, so a 1-day window catches every job the previous run might have missed without resending old ones

    const jobs = await this.prisma.job.findMany({
      where: { companyId: company.id, status: 'completed', actualEnd: { gte: windowStart } },
      include: { customer: true },
    });

    let sent = 0;
    let failed = 0;
    for (const job of jobs) {
      const dedupeKey = `job_thank_you:${job.id}`;
      const defaultBody = `Hi ${job.customer.firstName ?? ''}, thank you for trusting ${company.name} with your ${job.title.toLowerCase()}! It was a pleasure working with you — don't hesitate to reach out if you need anything else.`;
      const ok = await this.sendOnce({
        companyId: company.id,
        customerId: job.customerId,
        ruleType: 'job_thank_you',
        dedupeKey,
        phone: job.customer.phone,
        email: job.customer.email,
        subject: template?.subject || `Thank you from ${company.name}`,
        body: template?.body || defaultBody,
      });
      ok ? sent++ : failed++;
    }
    return { sent, failed };
  }

  // ===========================================================================
  // Estimate expiration — always runs (not gated by a settings toggle,
  // unlike the six rules above; this is a correctness transition, not an
  // optional reminder). Reuses EstimatesService.markExpired directly —
  // the exact same status-transition method the manual staff action
  // calls — rather than a second implementation of "what happens when
  // an estimate expires" living here.
  // ===========================================================================
  private async runEstimateExpiration(company: { id: string; name: string }) {
    const expired = await this.prisma.estimate.findMany({
      where: { companyId: company.id, status: { in: ['sent', 'viewed'] }, validUntil: { lt: new Date() } },
      select: { id: true },
    });
    for (const estimate of expired) {
      try {
        await this.estimates.markExpired(company.id, estimate.id, null, 'automation');
      } catch (err) {
        this.logger.error(`Failed to auto-expire estimate ${estimate.id}`, err as Error);
      }
    }
  }

  /**
   * Insert-then-send, not check-then-send: the dedupe row is written FIRST,
   * inside the same operation that would fail on a duplicate key. If a
   * second cron run (or a race between two overlapping runs) tries the
   * same dedupeKey, the unique constraint rejects the insert and we skip
   * sending — the database is the source of truth for "have we already
   * sent this," not an application-level check that has a race window.
   *
   * "Estimate Sent/Viewed/Approved/Rejected, Invoice Sent/Viewed/Paid"
   * events elsewhere in the app go through the standalone
   * logAutomationEvent utility (common/utils/automation-event.util.ts),
   * not a method here — that utility is what's actually RLS-safe
   * (routes through withTenantContext) and is already the one real path
   * Estimates/Invoices/Payments/Portal all use.
   */

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
