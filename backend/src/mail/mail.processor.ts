import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { renderEmailTemplate } from './email-templates';
import { PrismaService } from '../common/prisma/prisma.service';

interface MailAttachment {
  filename: string;
  contentBase64: string;
  contentType: string;
}

interface MailJobData {
  to: string;
  template: string;
  data: Record<string, any>;
  /** Set only for document emails (estimate/invoice send) — ties this
   * job back to the real, persistent email_log row so delivery status
   * survives past whatever BullMQ itself remembers. companyId travels
   * alongside it because this worker runs with no HTTP request context
   * — the tenant-context Prisma extension only wraps model operations
   * (.findMany/.create/etc), never raw $executeRaw calls, so updating
   * email_log here has to go through withTenantContext explicitly. */
  emailLogId?: string;
  companyId?: string;
  /** Sourced from Email Settings' Reply-To field (companies.reply_to_email)
   * — the whole point of that setting being stored is a customer's reply
   * landing somewhere real, not just it existing in the database unused. */
  replyTo?: string;
  attachment?: MailAttachment;
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
 *
 * Attachment support and email_log status updates were added for the
 * PDF & Email System — both apply uniformly to every job type, not just
 * estimate/invoice sends, since a future template could reasonably want
 * an attachment too.
 */
@Processor('mail')
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<MailJobData>): Promise<void> {
    const { to, template, data, emailLogId, companyId, replyTo, attachment } = job.data;
    const serverToken = this.config.get<string>('POSTMARK_SERVER_TOKEN');
    const fromAddress = this.config.get<string>('MAIL_FROM_ADDRESS');

    if (!serverToken || !fromAddress) {
      // No credentials configured — log and skip, don't throw. Throwing
      // would make BullMQ retry with exponential backoff for a condition
      // that will never resolve itself (a missing env var doesn't fix
      // itself between retries), just burning retry attempts for nothing.
      this.logger.warn(`POSTMARK_SERVER_TOKEN/MAIL_FROM_ADDRESS not configured — email "${template}" to ${to} not sent`);
      if (emailLogId && companyId) await this.updateEmailLog(companyId, emailLogId, 'failed', undefined, 'Email provider not configured');
      return;
    }

    const rendered = renderEmailTemplate(template, data);
    if (!rendered) {
      this.logger.error(`Unknown email template "${template}" — job data: ${JSON.stringify(data)}`);
      if (emailLogId && companyId) await this.updateEmailLog(companyId, emailLogId, 'failed', undefined, `Unknown template "${template}"`);
      return;
    }

    try {
      const fromHeader = companyId ? await this.buildFromHeader(companyId, fromAddress) : fromAddress;
      const response = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Postmark-Server-Token': serverToken,
        },
        body: JSON.stringify({
          From: fromHeader,
          To: to,
          Subject: rendered.subject,
          HtmlBody: rendered.html,
          MessageStream: 'outbound',
          ...(replyTo ? { ReplyTo: replyTo } : {}),
          ...(attachment
            ? { Attachments: [{ Name: attachment.filename, Content: attachment.contentBase64, ContentType: attachment.contentType }] }
            : {}),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        if (emailLogId && companyId) await this.updateEmailLog(companyId, emailLogId, 'failed', undefined, `Postmark ${response.status}: ${errorBody.slice(0, 500)}`);
        // Throwing here IS correct (unlike the missing-config case above) —
        // a non-2xx from Postmark (rate limit, transient outage) is exactly
        // the kind of failure BullMQ's exponential backoff retry exists for.
        throw new Error(`Postmark send failed (${response.status}): ${errorBody}`);
      }

      const result = await response.json().catch(() => null);
      if (emailLogId && companyId) await this.updateEmailLog(companyId, emailLogId, 'sent', result?.MessageID);
    } catch (err) {
      // Only mark failed here if we haven't already (the non-ok branch
      // above already recorded the real Postmark error) — this catches
      // network-level failures (DNS, timeout) that never got a response.
      if (emailLogId && companyId && err instanceof Error && !err.message.startsWith('Postmark send failed')) {
        await this.updateEmailLog(companyId, emailLogId, 'failed', undefined, err.message);
      }
      throw err;
    }
  }

  /**
   * Postmark (and every real mail provider) accepts From as a plain
   * address OR as `"Display Name" <address>` — this is what was
   * actually missing, not a Postmark-side setting. Every document email
   * (estimate/invoice send) always carries companyId, so this always
   * resolves for the exact case that matters (a customer should see
   * "Relentless Pressure Wash," not "no-reply@renovocrm.com"). Platform
   * emails with no companyId (verification, password reset, invites,
   * security alerts — see MailJobData's own comment on why those never
   * carry one) fall back to the bare address unchanged, since there's
   * no single tenant's brand to attach to an account-level email.
   * dba || name mirrors the exact same fallback PortalDataService.
   * getDashboard already uses for the customer-facing company name —
   * one convention, not a second one invented here.
   */
  private async buildFromHeader(companyId: string, fromAddress: string): Promise<string> {
    try {
      // Raw SQL, not tx.company.findFirst() — `dba` is a real column on
      // the companies table but is NOT declared in schema.prisma (same
      // gap CompanyContextService.getCompanyAndBranding already works
      // around the same way); the typed Prisma Client has no way to
      // select a field it doesn't know exists.
      const rows = await this.prisma.withTenantContext(companyId, (tx) =>
        tx.$queryRawUnsafe(`SELECT name, dba FROM companies WHERE id = $1::uuid`, companyId),
      ) as { name: string; dba: string | null }[];
      const displayName = (rows[0]?.dba || rows[0]?.name)?.replace(/"/g, '').trim();
      return displayName ? `"${displayName}" <${fromAddress}>` : fromAddress;
    } catch (err) {
      // A lookup failure here should never block the email itself —
      // worst case it sends from the bare address, same as before this
      // change existed.
      this.logger.warn(`Could not resolve company name for From header (companyId ${companyId}): ${(err as Error).message}`);
      return fromAddress;
    }
  }

  private async updateEmailLog(companyId: string, id: string, status: 'sent' | 'failed', providerMessageId?: string, errorMessage?: string) {
    try {
      await this.prisma.withTenantContext(companyId, async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE email_log SET status = $2, provider_message_id = $3, error_message = $4, updated_at = now() WHERE id = $1::uuid`,
          id,
          status,
          providerMessageId ?? null,
          errorMessage ?? null,
        );
      });
    } catch (err) {
      // The email itself already sent or failed for real — a logging
      // write failing afterward shouldn't throw and cause BullMQ to
      // retry an email that already went out.
      this.logger.error(`Failed to update email_log ${id}`, err as Error);
    }
  }
}
