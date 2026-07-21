import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateEmailLogInput {
  companyId: string;
  relatedType: 'estimate' | 'invoice';
  relatedId: string;
  recipientEmail: string;
  subject: string;
  template: string;
  sentByUserId: string;
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
        `INSERT INTO email_log (company_id, related_type, related_id, recipient_email, subject, template, status, sent_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7)
         RETURNING id`,
        input.companyId,
        input.relatedType,
        input.relatedId,
        input.recipientEmail,
        input.subject,
        input.template,
        input.sentByUserId,
      );
      return rows[0].id;
    });
  }

  async listForDocument(companyId: string, relatedType: 'estimate' | 'invoice', relatedId: string) {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      return tx.$queryRawUnsafe(
        `SELECT id, recipient_email AS "recipientEmail", subject, status, error_message AS "errorMessage", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM email_log WHERE company_id = $1 AND related_type = $2 AND related_id = $3
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
         WHERE company_id = $1 AND related_type = $2 AND related_id = $3
         ORDER BY created_at DESC LIMIT 1`,
        companyId,
        relatedType,
        relatedId,
      );
      return rows[0]?.recipientEmail ?? null;
    });
  }
}
