import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Every number here is a read-only aggregate over data that already
 * exists — Invoices, Payments, Estimates, Jobs, Service Catalog. No
 * calculation is reinvented: "Profit" reuses the exact profitability
 * math already computed and gated by estimates.profitability
 * (estimate-profit.util.ts), "Revenue" is the same total_amount column
 * Invoices already computes via computeDocumentTotals. This module adds
 * zero new business logic — only aggregation of logic that already
 * exists elsewhere, which is exactly what "design for future reporting"
 * meant every time it was flagged across earlier modules.
 *
 * Every query goes through withTenantContext explicitly (raw SQL is
 * never covered by the tenant-context Prisma extension — the same fix
 * applied everywhere else this session).
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The always-current snapshot: today/week/month/year revenue and the
   * point-in-time outstanding/overdue balances. Deliberately ignores
   * any custom date range — "revenue today" has exactly one meaning,
   * computed server-side from now(), not something a client-supplied
   * range should be able to redefine.
   */
  async getSnapshotKpis(companyId: string, canViewProfitability: boolean) {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const revenue: any[] = await tx.$queryRaw`
        SELECT
          COALESCE(SUM(total_amount) FILTER (WHERE created_at >= date_trunc('day', now())), 0) AS "revenueToday",
          COALESCE(SUM(total_amount) FILTER (WHERE created_at >= date_trunc('week', now())), 0) AS "revenueThisWeek",
          COALESCE(SUM(total_amount) FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS "revenueThisMonth",
          COALESCE(SUM(total_amount) FILTER (WHERE created_at >= date_trunc('year', now())), 0) AS "revenueThisYear"
        FROM invoices WHERE company_id = ${companyId}::uuid AND status != 'void'
      `;

      const balances: any[] = await tx.$queryRaw`
        SELECT
          COALESCE(SUM(balance_due) FILTER (WHERE status IN ('sent','partial')), 0) AS "outstandingInvoices",
          COALESCE(SUM(balance_due) FILTER (WHERE status IN ('sent','partial') AND due_date < CURRENT_DATE), 0) AS "overdueInvoices",
          COUNT(*) FILTER (WHERE status IN ('sent','partial') AND due_date < CURRENT_DATE) AS "overdueInvoiceCount"
        FROM invoices WHERE company_id = ${companyId}::uuid
      `;

      const payments: any[] = await tx.$queryRaw`
        SELECT COALESCE(SUM(amount), 0) AS "paymentsReceivedThisMonth"
        FROM payments WHERE company_id = ${companyId}::uuid AND status = 'succeeded' AND processed_at >= date_trunc('month', now())
      `;

      const taxes: any[] = await tx.$queryRaw`
        SELECT COALESCE(SUM(tax_amount), 0) AS "taxesCollectedThisMonth"
        FROM invoices WHERE company_id = ${companyId}::uuid AND status != 'void' AND created_at >= date_trunc('month', now())
      `;

      let profit: { estimatedProfitThisMonth: number; profitMarginPercent: number | null } | null = null;
      if (canViewProfitability) {
        // Reuses the exact profitability figures Estimates already
        // computes per line item (estimate-profit.util.ts) — summed
        // here, not recalculated. This is intentionally "estimated"
        // profit, not "actual": chemical/equipment actual dollar cost
        // isn't tracked anywhere yet (only usage quantities), so a real
        // actual-cost P&L isn't honestly achievable from today's data —
        // stated plainly rather than approximated silently.
        const profitRows: any[] = await tx.$queryRaw`
          SELECT COALESCE(SUM(eli.estimated_profit), 0) AS "estimatedProfit", COALESCE(SUM(eli.total), 0) AS "totalRevenue"
          FROM estimate_line_items eli
          JOIN estimates e ON e.id = eli.estimate_id
          WHERE eli.company_id = ${companyId}::uuid AND e.status = 'accepted' AND e.created_at >= date_trunc('month', now())
        `;
        const totalRevenue = Number(profitRows[0]?.totalRevenue ?? 0);
        const estimatedProfit = Number(profitRows[0]?.estimatedProfit ?? 0);
        profit = {
          estimatedProfitThisMonth: estimatedProfit,
          profitMarginPercent: totalRevenue > 0 ? Math.round((estimatedProfit / totalRevenue) * 10000) / 100 : null,
        };
      }

      return {
        ...revenue[0],
        ...balances[0],
        ...payments[0],
        ...taxes[0],
        profit,
      };
    });
  }

  /** Sales + Operations KPIs for a caller-supplied date range. */
  async getPeriodKpis(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const estimates: any[] = await tx.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('sent','viewed','accepted','declined','expired')) AS "estimatesSent",
          COUNT(*) FILTER (WHERE status = 'accepted') AS "estimatesAccepted",
          COALESCE(AVG(total_amount) FILTER (WHERE status = 'accepted'), 0) AS "averageTicket"
        FROM estimates WHERE company_id = ${companyId}::uuid AND created_at >= ${start} AND created_at < ${end}
      `;
      const sentCount = Number(estimates[0]?.estimatesSent ?? 0);
      const acceptedCount = Number(estimates[0]?.estimatesAccepted ?? 0);

      const jobs: any[] = await tx.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE status = 'completed' AND actual_end >= ${start} AND actual_end < ${end}) AS "jobsCompleted",
          COUNT(*) FILTER (WHERE scheduled_start >= ${start} AND scheduled_start < ${end}) AS "jobsScheduled",
          COALESCE(AVG(EXTRACT(EPOCH FROM (actual_end - actual_start)) / 3600) FILTER (WHERE status = 'completed' AND actual_end >= ${start} AND actual_end < ${end}), 0) AS "averageJobDurationHours",
          COALESCE(SUM(billable_labor_hours) FILTER (WHERE status = 'completed' AND actual_end >= ${start} AND actual_end < ${end}), 0) AS "totalLaborHours"
        FROM jobs WHERE company_id = ${companyId}::uuid
      `;

      return {
        estimateConversionRatePercent: sentCount > 0 ? Math.round((acceptedCount / sentCount) * 10000) / 100 : null,
        averageTicket: Number(estimates[0]?.averageTicket ?? 0),
        ...jobs[0],
      };
    });
  }

  /** Revenue Trend chart — daily invoice totals across the range. */
  async getRevenueTrend(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT date_trunc('day', created_at)::date AS "date", SUM(total_amount) AS "revenue"
      FROM invoices
      WHERE company_id = ${companyId}::uuid AND status != 'void' AND created_at >= ${start} AND created_at < ${end}
      GROUP BY 1 ORDER BY 1 ASC
    `);
  }

  /** Payment Trend chart — daily payments actually collected. */
  async getPaymentTrend(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT date_trunc('day', processed_at)::date AS "date", SUM(amount) AS "amount"
      FROM payments
      WHERE company_id = ${companyId}::uuid AND status = 'succeeded' AND processed_at >= ${start} AND processed_at < ${end}
      GROUP BY 1 ORDER BY 1 ASC
    `);
  }

  /**
   * Revenue by Service — reuses the Service Catalog trace-through
   * already built into invoice_line_items (service_catalog_item_id),
   * falling back to the raw service_type string for line items that
   * predate the catalog or were hand-typed rather than picked from it.
   */
  async getRevenueByService(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT COALESCE(sci.name, ili.service_type, 'Other') AS "serviceName", SUM(ili.total) AS "revenue", COUNT(DISTINCT ili.invoice_id) AS "invoiceCount"
      FROM invoice_line_items ili
      JOIN invoices i ON i.id = ili.invoice_id
      LEFT JOIN service_catalog_items sci ON sci.id = ili.service_catalog_item_id
      WHERE ili.company_id = ${companyId}::uuid AND i.status != 'void' AND i.created_at >= ${start} AND i.created_at < ${end}
      GROUP BY 1 ORDER BY 2 DESC
      LIMIT 15
    `);
  }

  /** Revenue by Customer — top customers by invoiced revenue in the range. */
  async getRevenueByCustomer(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT c.id AS "customerId", COALESCE(c.business_name, c.first_name || ' ' || c.last_name) AS "customerName",
             SUM(i.total_amount) AS "revenue", COUNT(*) AS "invoiceCount"
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.company_id = ${companyId}::uuid AND i.status != 'void' AND i.created_at >= ${start} AND i.created_at < ${end}
      GROUP BY c.id, c.business_name, c.first_name, c.last_name
      ORDER BY revenue DESC
      LIMIT 15
    `);
  }

  /** Estimate Pipeline — current counts by status, point-in-time (not range-bound). */
  async getEstimatePipeline(companyId: string) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT status, COUNT(*) AS "count", COALESCE(SUM(total_amount), 0) AS "totalValue"
      FROM estimates WHERE company_id = ${companyId}::uuid AND status IN ('draft','sent','viewed','accepted','declined','expired')
      GROUP BY status
    `);
  }

  /** Job Completion Trend — daily completed-job counts across the range. */
  async getJobCompletionTrend(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT date_trunc('day', actual_end)::date AS "date", COUNT(*) AS "jobsCompleted"
      FROM jobs
      WHERE company_id = ${companyId}::uuid AND status = 'completed' AND actual_end >= ${start} AND actual_end < ${end}
      GROUP BY 1 ORDER BY 1 ASC
    `);
  }

  // =========================================================================
  // Customer Analytics — every figure here is derived from invoices/jobs
  // that already exist; no new customer-facing tracking was added.
  // =========================================================================

  /**
   * Repeat rate, CLV, and average time between services are genuinely
   * new calculations (nothing upstream computes these today), but every
   * input is a column that already exists — invoices.total_amount,
   * jobs.actual_end, jobs.customer_id. Point-in-time across the whole
   * customer base, not range-bound: "is this customer a repeat customer"
   * has one real answer regardless of what date range a report happens to
   * be viewed with.
   */
  async getCustomerAnalytics(companyId: string) {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const summary: any[] = await tx.$queryRaw`
        WITH customer_job_counts AS (
          SELECT customer_id, COUNT(*) AS job_count
          FROM jobs WHERE company_id = ${companyId}::uuid AND status = 'completed'
          GROUP BY customer_id
        ),
        customer_revenue AS (
          SELECT customer_id, SUM(total_amount) AS lifetime_value
          FROM invoices WHERE company_id = ${companyId}::uuid AND status != 'void'
          GROUP BY customer_id
        )
        SELECT
          COUNT(*) FILTER (WHERE job_count > 1) AS "repeatCustomerCount",
          COUNT(*) AS "totalActiveCustomers",
          COALESCE(AVG(cr.lifetime_value), 0) AS "averageLifetimeValue"
        FROM customer_job_counts cjc
        LEFT JOIN customer_revenue cr ON cr.customer_id = cjc.customer_id
      `;

      // Average days between consecutive completed jobs for the same
      // customer, averaged across every customer with 2+ completed jobs.
      const avgGap: any[] = await tx.$queryRaw`
        WITH ordered_jobs AS (
          SELECT customer_id, actual_end,
                 actual_end - LAG(actual_end) OVER (PARTITION BY customer_id ORDER BY actual_end) AS gap
          FROM jobs WHERE company_id = ${companyId}::uuid AND status = 'completed' AND actual_end IS NOT NULL
        )
        SELECT COALESCE(AVG(EXTRACT(EPOCH FROM gap) / 86400), 0) AS "averageDaysBetweenServices"
        FROM ordered_jobs WHERE gap IS NOT NULL
      `;

      const total = Number(summary[0]?.totalActiveCustomers ?? 0);
      const repeat = Number(summary[0]?.repeatCustomerCount ?? 0);
      return {
        repeatCustomerCount: repeat,
        totalActiveCustomers: total,
        repeatCustomerRatePercent: total > 0 ? Math.round((repeat / total) * 10000) / 100 : null,
        averageLifetimeValue: Number(summary[0]?.averageLifetimeValue ?? 0),
        averageDaysBetweenServices: Math.round(Number(avgGap[0]?.averageDaysBetweenServices ?? 0)),
      };
    });
  }

  // =========================================================================
  // Operations — Technician Performance and Chemical/Equipment usage.
  // Chemical/equipment usage is reported by QUANTITY, not dollar cost —
  // job_chemical_usage/job_equipment_usage were never designed to carry
  // a per-unit price (only quantity + unit), so a real "Chemical Cost"
  // figure isn't honestly derivable from today's data. Reporting usage
  // volume instead of fabricating a cost number is the same honesty
  // already applied to "estimated" vs "actual" profit in the snapshot.
  // =========================================================================

  async getTechnicianPerformance(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT u.id AS "technicianId", u.first_name AS "firstName", u.last_name AS "lastName",
             COUNT(*) AS "jobsCompleted",
             COALESCE(AVG(EXTRACT(EPOCH FROM (j.actual_end - j.actual_start)) / 3600), 0) AS "averageJobDurationHours",
             COALESCE(SUM(j.billable_labor_hours), 0) AS "totalLaborHours"
      FROM jobs j
      JOIN users u ON u.id = j.assigned_user_id
      WHERE j.company_id = ${companyId}::uuid AND j.status = 'completed'
        AND j.actual_end >= ${start} AND j.actual_end < ${end} AND j.assigned_user_id IS NOT NULL
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY "jobsCompleted" DESC
    `);
  }

  async getChemicalUsageSummary(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT jcu.chemical_name AS "chemicalName", jcu.unit, SUM(jcu.quantity) AS "totalQuantity", COUNT(DISTINCT jcu.job_id) AS "jobCount"
      FROM job_chemical_usage jcu
      JOIN jobs j ON j.id = jcu.job_id
      WHERE jcu.company_id = ${companyId}::uuid AND jcu.created_at >= ${start} AND jcu.created_at < ${end}
      GROUP BY jcu.chemical_name, jcu.unit
      ORDER BY "totalQuantity" DESC
      LIMIT 15
    `);
  }

  async getEquipmentUsageSummary(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT equipment_name AS "equipmentName", COUNT(*) AS "usageCount", COUNT(DISTINCT job_id) AS "jobCount"
      FROM job_equipment_usage
      WHERE company_id = ${companyId}::uuid AND created_at >= ${start} AND created_at < ${end}
      GROUP BY equipment_name
      ORDER BY "usageCount" DESC
      LIMIT 15
    `);
  }

  // =========================================================================
  // Outstanding Receivables aging + Monthly Profit — the two remaining
  // requested chart data sources.
  // =========================================================================

  /** Point-in-time aging buckets — not range-bound, same reasoning as the snapshot KPIs. */
  async getReceivablesAging(companyId: string) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT
        COALESCE(SUM(balance_due) FILTER (WHERE due_date IS NULL OR due_date >= CURRENT_DATE), 0) AS "current",
        COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - INTERVAL '30 days'), 0) AS "days1To30",
        COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '30 days' AND due_date >= CURRENT_DATE - INTERVAL '60 days'), 0) AS "days31To60",
        COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '60 days'), 0) AS "days60Plus"
      FROM invoices WHERE company_id = ${companyId}::uuid AND status IN ('sent', 'partial')
    `);
  }

  /**
   * Monthly Profit chart — same estimated-profit reasoning and same
   * permission gate as the snapshot KPI, just grouped by month across a
   * range instead of a single current-month figure. Caller (controller)
   * is responsible for only exposing this to estimates.profitability holders.
   */
  async getMonthlyProfitTrend(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT date_trunc('month', e.created_at)::date AS "month",
             COALESCE(SUM(eli.estimated_profit), 0) AS "profit",
             COALESCE(SUM(eli.total), 0) AS "revenue"
      FROM estimate_line_items eli
      JOIN estimates e ON e.id = eli.estimate_id
      WHERE eli.company_id = ${companyId}::uuid AND e.status = 'accepted' AND e.created_at >= ${start} AND e.created_at < ${end}
      GROUP BY 1 ORDER BY 1 ASC
    `);
  }

  // =========================================================================
  // Lead Source Analytics — every figure here reuses an existing, already-
  // correct source of truth rather than recomputing anything:
  //   - Revenue: invoices.total_amount, same table/status-filter convention
  //     as getRevenueByCustomer above.
  //   - Lifetime Value: customers.lifetime_value directly — the maintained
  //     column (Phase 1/2 of the Lifetime Value work), NOT a fresh
  //     SUM(invoices.total_amount) the way getCustomerAnalytics above does.
  //     That existing method computes its own separate, invoice-based
  //     "lifetime value" — a real, pre-existing inconsistency found during
  //     this feature's audit, flagged rather than silently copied. This
  //     method deliberately uses the correct, payments-based column so it
  //     doesn't become a third way of answering the same question.
  //   - Conversion: defined as "received at least one succeeded payment" —
  //     the strongest, most economically meaningful signal a lead source
  //     produced real revenue, not just an accepted estimate that could
  //     still fall through before payment.
  // =========================================================================

  async getLeadSourceAnalytics(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      WITH source_customers AS (
        SELECT id, COALESCE(NULLIF(source, ''), 'Not specified') AS source, lifetime_value
        FROM customers
        WHERE company_id = ${companyId}::uuid AND created_at >= ${start} AND created_at < ${end}
      ),
      source_revenue AS (
        SELECT c.id AS customer_id, SUM(i.total_amount) AS revenue, COUNT(i.id) AS invoice_count
        FROM invoices i
        JOIN customers c ON c.id = i.customer_id
        WHERE i.company_id = ${companyId}::uuid AND i.status != 'void'
        GROUP BY c.id
      ),
      source_jobs AS (
        SELECT customer_id, COUNT(*) AS completed_job_count
        FROM jobs
        WHERE company_id = ${companyId}::uuid AND status = 'completed'
        GROUP BY customer_id
      ),
      source_converted AS (
        SELECT DISTINCT customer_id FROM payments
        WHERE company_id = ${companyId}::uuid AND status = 'succeeded'
      )
      SELECT
        sc.source,
        COUNT(*) AS "leadCount",
        COUNT(*) FILTER (WHERE sconv.customer_id IS NOT NULL) AS "convertedCount",
        COALESCE(SUM(sr.revenue), 0) AS "totalRevenue",
        COALESCE(AVG(sr.revenue), 0) AS "averageRevenuePerCustomer",
        COALESCE(SUM(sr.invoice_count), 0) AS "invoiceCount",
        CASE WHEN COALESCE(SUM(sr.invoice_count), 0) > 0 THEN COALESCE(SUM(sr.revenue), 0) / SUM(sr.invoice_count) ELSE 0 END AS "averageTicket",
        COALESCE(AVG(sc.lifetime_value), 0) AS "averageLifetimeValue",
        COALESCE(SUM(sc.lifetime_value), 0) AS "totalLifetimeValue",
        COUNT(*) FILTER (WHERE sj.completed_job_count > 1) AS "repeatCustomerCount"
      FROM source_customers sc
      LEFT JOIN source_revenue sr ON sr.customer_id = sc.id
      LEFT JOIN source_jobs sj ON sj.customer_id = sc.id
      LEFT JOIN source_converted sconv ON sconv.customer_id = sc.id
      GROUP BY sc.source
      ORDER BY "totalRevenue" DESC
    `);
  }

  /** Monthly Lead Trends — new customers per month, broken down by source. */
  async getLeadSourceTrend(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT date_trunc('month', created_at)::date AS "month",
             COALESCE(NULLIF(source, ''), 'Not specified') AS "source",
             COUNT(*) AS "leadCount"
      FROM customers
      WHERE company_id = ${companyId}::uuid AND created_at >= ${start} AND created_at < ${end}
      GROUP BY 1, 2 ORDER BY 1 ASC
    `);
  }
}
