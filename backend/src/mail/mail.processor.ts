import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { renderEmailTemplate } from './email-templates';

interface MailJobData {
  to: string;
  template: string;
  data: Record<string, any>;
}

/**
 * This is the actual fix for the gap found before this feature started:
 * MailService.enqueue() has always pushed real jobs onto a real Redis
 * queue — nothing was ever wrong with that half. This is the half that
 * was missing: something that actually pulls jobs off the queue and
 * calls a real email provider. Every one of MailService's six existing
 * senders (verification, password reset, invites, security alerts,
 * portal magic links, lead notifications) starts actually delivering the
 * moment this processor exists and POSTMARK_SERVER_TOKEN is set — not
 * just the new automation email this feature adds.
 */
@Processor('mail')
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async process(job: Job<MailJobData>): Promise<void> {
    const { to, template, data } = job.data;
    const serverToken = this.config.get<string>('POSTMARK_SERVER_TOKEN');
    const fromAddress = this.config.get<string>('MAIL_FROM_ADDRESS');

    if (!serverToken || !fromAddress) {
      // No credentials configured — log and skip, don't throw. Throwing
      // would make BullMQ retry with exponential backoff for a condition
      // that will never resolve itself (a missing env var doesn't fix
      // itself between retries), just burning retry attempts for nothing.
      this.logger.warn(`POSTMARK_SERVER_TOKEN/MAIL_FROM_ADDRESS not configured — email "${template}" to ${to} not sent`);
      return;
    }

    const rendered = renderEmailTemplate(template, data);
    if (!rendered) {
      this.logger.error(`Unknown email template "${template}" — job data: ${JSON.stringify(data)}`);
      return;
    }

    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Postmark-Server-Token': serverToken,
      },
      body: JSON.stringify({
        From: fromAddress,
        To: to,
        Subject: rendered.subject,
        HtmlBody: rendered.html,
        MessageStream: 'outbound',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      // Throwing here IS correct (unlike the missing-config case above) —
      // a non-2xx from Postmark (rate limit, transient outage) is exactly
      // the kind of failure BullMQ's exponential backoff retry exists for.
      throw new Error(`Postmark send failed (${response.status}): ${errorBody}`);
    }
  }
}
