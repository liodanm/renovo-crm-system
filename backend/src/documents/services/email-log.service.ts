import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateEmailLogInput {
  companyId: string;
  relatedType: 'estimate' | 'invoice';
  relatedId: string;
  // Exactly one of these two is required, matching migration 045's own
  // DB-level CHECK constraint — recipientEmail for channel:'email',
  // recipientPhone for channel:'sms'. Not enforced again here in TS
  // beyond both being optional; the database is the real backstop.
  recipientEmail?: string;
  recipientPhone?: string;
  channel?: 'email' | 'sms'; // defaults to 'email' — every existing call site is unaffected
  subject: string;
  template: string;
  // Optional, not required — sent_by_user_id is a nullable FK at the DB
  // level (migration 022: `UUID REFERENCES users(id)`, no NOT NULL).
  // Every existing staff-facing call site already has a real user and is
  // unaffected; this stayed required in TS only because nothing had a
  // legitimate reason to omit it until the Quote Widget (Phase 1) — an
  // estimate email triggered from a public, unauthenticated flow has no
  // staff user to attribute it to.
  sentByUserId?: string;
}

/**
 * Every read and write here goes through withTenantContext explicitly —
 * this table is queried via $queryRaw/$executeRaw (generated total-style
 * columns aside, this one just needs raw SQL for simplicity), and raw
 * query methods are NOT covered by the tenant-context Prisma extension
 * (that extension only wraps model operations like .findMany/.create).
 * Skipping withTenantContext here would silently return zero rows
 * against a real, non-superuser production database connection with RLS
 * enforced — the exact failure mode already documented in PrismaService
 * itself from an earlier audit finding.
 */
@Injectable()
export class EmailLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateEmailLogInput): Promise<string> {
    return this.prisma.withTenantContext(input.companyId, async (tx) => {
      const rows: { id: string }[] = await tx.$queryRawUnsafe(
        `INSERT INTO email_log (company_id, related_type, related_id, recipient_email, recipient_phone, channel, subject, template, status, sent_by_user_id)
         VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7, $8, 'queued', $9::uuid)
         RETURNING id`,
        input.companyId,
        input.relatedType,
        input.relatedId,
        input.recipientEmail ?? null,
        input.recipientPhone ?? null,
        input.channel ?? 'email',
        input.subject,
        input.template,
        input.sentByUserId ?? null,
      );
      return rows[0].id;
    });
  }

  /**
   * SMS sends are synchronous (SmsService.send() returns the real
   * result immediately — no queue/worker the way Postmark email has),
   * so the caller updates status right after sending, not via an async
   * processor. Kept as its own method rather than duplicated raw SQL
   * inline in EstimatesService, matching how every other write to this
   * table goes through EmailLogService.
   */
  async updateStatus(companyId: string, id: string, status: 'sent' | 'failed', errorMessage?: string): Promise<void> {
    await this.prisma.withTenantContext(companyId, (tx) =>
      tx.$executeRawUnsafe(
        `UPDATE email_log SET status = $2, error_message = $3, updated_at = now() WHERE id = $1::uuid`,
        id,
        status,
        errorMessage ?? null,
      ),
    );
  }

  async listForDocument(companyId: string, relatedType: 'estimate' | 'invoice', relatedId: string) {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      return tx.$queryRawUnsafe(
        `SELECT id, recipient_email AS "recipientEmail", recipient_phone AS "recipientPhone", channel, subject, status, error_message AS "errorMessage", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM email_log WHERE company_id = $1::uuid AND related_type = $2 AND related_id = $3::uuid
         ORDER BY created_at DESC`,
        companyId,
        relatedType,
        relatedId,
      );
    });
  }

  async getLastRecipient(companyId: string, relatedType: 'estimate' | 'invoice', relatedId: string): Promise<string | null> {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const rows: { recipientEmail: string }[] = await tx.$queryRawUnsafe(
        `SELECT recipient_email AS "recipientEmail" FROM email_log
         WHERE company_id = $1::uuid AND related_type = $2 AND related_id = $3::uuid
         ORDER BY created_at DESC LIMIT 1`,
        companyId,
        relatedType,
        relatedId,
      );
      return rows[0]?.recipientEmail ?? null;
    });
  }
}
