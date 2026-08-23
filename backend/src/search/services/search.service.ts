import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const RESULT_LIMIT = 5;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every category here reuses the exact search-matching *condition*
   * CustomersService.list() already established (ILIKE across name/
   * business/email/phone, backed by the same trigram index) — but not
   * that method itself, which also joins balances/properties/last-
   * service-dates for its own, different purpose. Pulling all of that
   * for a lightweight search dropdown would be wasteful, not genuine
   * reuse. Estimates/Invoices/Jobs had no search capability anywhere
   * before this, so those are new, equally lean, targeted queries —
   * each scoped by companyId like every other query in this codebase,
   * each ordering an exact document-number match first, per the
   * explicit requirement that "INV-1025" should find that invoice
   * first, not just somewhere in a list of loose matches.
   */
  async globalSearch(companyId: string, term: string) {
    const trimmed = term.trim();
    if (!trimmed) {
      return { customers: [], estimates: [], invoices: [], jobs: [] };
    }

    const [customers, estimates, invoices, jobs] = await Promise.all([
      this.searchCustomers(companyId, trimmed),
      this.searchEstimates(companyId, trimmed),
      this.searchInvoices(companyId, trimmed),
      this.searchJobs(companyId, trimmed),
    ]);

    return { customers, estimates, invoices, jobs };
  }

  private async searchCustomers(companyId: string, term: string) {
    return this.prisma.withTenantContext(companyId, (tx) =>
      tx.$queryRawUnsafe(
        `SELECT id, first_name AS "firstName", last_name AS "lastName", business_name AS "businessName",
                email, phone
         FROM customers
         WHERE company_id = $1::uuid AND deleted_at IS NULL
           AND (
             first_name ILIKE $2 OR last_name ILIKE $2 OR business_name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2
             -- Also checks the concatenated full name — first_name and
             -- last_name are separate columns, so searching "John Smith"
             -- as one phrase (the exact example in the spec) would
             -- otherwise match neither column individually and silently
             -- return nothing.
             OR (first_name || ' ' || last_name) ILIKE $2
           )
         ORDER BY created_at DESC
         LIMIT ${RESULT_LIMIT}`,
        companyId,
        `%${term}%`,
      ),
    );
  }

  private async searchEstimates(companyId: string, term: string) {
    return this.prisma.withTenantContext(companyId, (tx) =>
      tx.$queryRawUnsafe(
        `SELECT e.id, e.estimate_number AS "estimateNumber", e.status, e.total_amount AS "totalAmount",
                c.first_name AS "customerFirstName", c.last_name AS "customerLastName", c.business_name AS "customerBusinessName"
         FROM estimates e
         JOIN customers c ON c.id = e.customer_id AND c.company_id = $1::uuid
         WHERE e.company_id = $1::uuid
           AND (e.estimate_number ILIKE $2 OR c.first_name ILIKE $2 OR c.last_name ILIKE $2 OR c.business_name ILIKE $2)
         ORDER BY (LOWER(e.estimate_number) = LOWER($3)) DESC, e.created_at DESC
         LIMIT ${RESULT_LIMIT}`,
        companyId,
        `%${term}%`,
        term,
      ),
    );
  }

  private async searchInvoices(companyId: string, term: string) {
    return this.prisma.withTenantContext(companyId, (tx) =>
      tx.$queryRawUnsafe(
        `SELECT i.id, i.invoice_number AS "invoiceNumber", i.status, i.total_amount AS "totalAmount",
                c.first_name AS "customerFirstName", c.last_name AS "customerLastName", c.business_name AS "customerBusinessName"
         FROM invoices i
         JOIN customers c ON c.id = i.customer_id AND c.company_id = $1::uuid
         WHERE i.company_id = $1::uuid
           AND (i.invoice_number ILIKE $2 OR c.first_name ILIKE $2 OR c.last_name ILIKE $2 OR c.business_name ILIKE $2)
         ORDER BY (LOWER(i.invoice_number) = LOWER($3)) DESC, i.created_at DESC
         LIMIT ${RESULT_LIMIT}`,
        companyId,
        `%${term}%`,
        term,
      ),
    );
  }

  private async searchJobs(companyId: string, term: string) {
    return this.prisma.withTenantContext(companyId, (tx) =>
      tx.$queryRawUnsafe(
        `SELECT j.id, j.job_number AS "jobNumber", j.title, j.status,
                c.first_name AS "customerFirstName", c.last_name AS "customerLastName", c.business_name AS "customerBusinessName"
         FROM jobs j
         JOIN customers c ON c.id = j.customer_id AND c.company_id = $1::uuid
         WHERE j.company_id = $1::uuid
           AND (j.job_number ILIKE $2 OR j.title ILIKE $2 OR c.first_name ILIKE $2 OR c.last_name ILIKE $2 OR c.business_name ILIKE $2)
         ORDER BY (LOWER(j.job_number) = LOWER($3)) DESC, j.created_at DESC
         LIMIT ${RESULT_LIMIT}`,
        companyId,
        `%${term}%`,
        term,
      ),
    );
  }
}
