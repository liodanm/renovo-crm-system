import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { DocumentCompany, DocumentBranding } from './pdf.service';

/**
 * The exact company + branding shape both Estimates and Invoices need
 * for PDF generation — one query, reused by both, rather than the same
 * raw SQL written twice. Branding is read live from companies.settings
 * JSONB at generation time (never copied onto the estimate/invoice
 * itself), matching the explicit decision made when Branding settings
 * were built: a later logo/color change should never rewrite history.
 */
@Injectable()
export class CompanyContextService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompanyAndBranding(companyId: string): Promise<{ company: DocumentCompany; branding: DocumentBranding }> {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const rows: any[] = await tx.$queryRawUnsafe(
        `SELECT name, dba, address_line1 AS "addressLine1", city, state, postal_code AS "postalCode",
                phone, email, website, settings
         FROM companies WHERE id = $1`,
        companyId,
      );
      const row = rows[0];
      const branding = row?.settings?.branding ?? {};
      return {
        company: {
          name: row?.name ?? '',
          dba: row?.dba ?? null,
          addressLine1: row?.addressLine1 ?? null,
          city: row?.city ?? null,
          state: row?.state ?? null,
          postalCode: row?.postalCode ?? null,
          phone: row?.phone ?? null,
          email: row?.email ?? null,
          website: row?.website ?? null,
        },
        branding: {
          logoUrl: branding.logoUrl ?? null,
          primaryColor: branding.primaryColor ?? null,
          footerMessage: branding.footerMessage ?? null,
          estimateHeader: branding.estimateHeader ?? null,
          invoiceHeader: branding.invoiceHeader ?? null,
        },
      };
    });
  }

  /**
   * A separate, focused query rather than folding this into
   * getCompanyAndBranding — that method exists specifically for PDF
   * generation and callers of it shouldn't pay for a field they don't
   * need. This is what closes the loop on Email Settings' Reply-To
   * field: without this, that setting would be stored but never
   * actually reach a real email.
   */
  async getReplyToEmail(companyId: string): Promise<string | null> {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const rows: { replyToEmail: string | null }[] = await tx.$queryRawUnsafe(`SELECT reply_to_email AS "replyToEmail" FROM companies WHERE id = $1`, companyId);
      return rows[0]?.replyToEmail ?? null;
    });
  }
}
