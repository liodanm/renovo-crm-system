import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * All transactional emails are enqueued (BullMQ) rather than sent inline,
 * so auth endpoints never block on—or fail because of—a flaky email
 * provider. `MailProcessor` (mail.processor.ts) consumes this queue and
 * calls the actual provider (Postmark).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectQueue('mail') private readonly mailQueue: Queue,
  ) {}

  async sendVerificationEmail(to: string, firstName: string, rawToken: string) {
    const url = `${this.config.get('auth.frontendUrl')}/verify-email?token=${rawToken}`;
    await this.enqueue('email-verification', to, {
      firstName,
      verificationUrl: url,
    });
  }

  async sendPasswordResetEmail(to: string, firstName: string, rawToken: string) {
    const url = `${this.config.get('auth.frontendUrl')}/reset-password?token=${rawToken}`;
    await this.enqueue('password-reset', to, {
      firstName,
      resetUrl: url,
      expiresInMinutes: Math.round((this.config.get<number>('auth.tokens.passwordResetTtlSeconds') ?? 3600) / 60),
    });
  }

  async sendCompanyInviteEmail(to: string, companyName: string, inviterName: string, rawToken: string) {
    const url = `${this.config.get('auth.frontendUrl')}/accept-invite?token=${rawToken}`;
    await this.enqueue('company-invite', to, {
      companyName,
      inviterName,
      acceptUrl: url,
    });
  }

  async sendSecurityAlertEmail(to: string, firstName: string, event: string, device: string) {
    await this.enqueue('security-alert', to, { firstName, event, device, occurredAt: new Date().toISOString() });
  }

  async sendPortalMagicLink(to: string, firstName: string, magicLinkUrl: string) {
    await this.enqueue('portal-magic-link', to, { firstName, magicLinkUrl, expiresInMinutes: 15 });
  }

  async sendNewLeadNotification(to: string, lead: { name: string; phone: string; email: string; serviceInterest: string }) {
    await this.enqueue('new-lead', to, lead);
  }

  /**
   * Reuses the exact same message text AutomationService already composed
   * for SMS — this is a delivery-channel fallback, not a second copy of
   * the message-writing logic living in two places that could drift apart.
   */
  async sendAutomationEmail(to: string, subject: string, body: string) {
    await this.enqueue('automation-message', to, { subject, body });
  }

  /**
   * The one real difference from every sender above: this one carries a
   * PDF attachment and a companyId + emailLogId, so MailProcessor can
   * write real delivery status back to the persistent email_log row —
   * none of the other six senders need that, since they were never
   * expected to have a "did this actually deliver" history a user would
   * ever look back at.
   */
  async sendDocumentEmail(input: {
    to: string;
    template: 'estimate-send' | 'invoice-send';
    data: Record<string, unknown>;
    companyId: string;
    emailLogId: string;
    replyTo?: string;
    attachment: { filename: string; contentBase64: string; contentType: string };
  }) {
    try {
      await this.mailQueue.add(
        input.template,
        { to: input.to, template: input.template, data: input.data, companyId: input.companyId, emailLogId: input.emailLogId, replyTo: input.replyTo, attachment: input.attachment },
        { attempts: 5, backoff: { type: 'exponential', delay: 5000 } },
      );
    } catch (err) {
      this.logger.error(`Failed to enqueue "${input.template}" email to ${input.to}`, err as Error);
      throw err; // unlike the fire-and-forget senders below, the caller here needs to know enqueueing itself failed, since it already created a real email_log row expecting this to run
    }
  }

  private async enqueue(template: string, to: string, data: Record<string, unknown>) {
    try {
      await this.mailQueue.add(
        template,
        { to, template, data },
        { attempts: 5, backoff: { type: 'exponential', delay: 5000 } },
      );
    } catch (err) {
      // Never let a queue outage break the auth flow itself — log and move on.
      // (Alerting on this failure mode is configured at the infra level.)
      this.logger.error(`Failed to enqueue "${template}" email to ${to}`, err as Error);
    }
  }
}
