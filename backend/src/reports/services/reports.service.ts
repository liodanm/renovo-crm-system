import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Mirrors the exact aliased columns in getJobCostDetail's SELECT below.
 * Raw $queryRaw results come back as strings/Decimals for numeric
 * Postgres columns (never real JS numbers) — every numeric field here
 * is typed as the string Prisma actually hands back, matching the same
 * convention every other interface in frontend/lib/api/reports.ts
 * already uses (e.g. RevenueByCustomer.revenue: string). Callers convert
 * via Number() at the point of use, same as everywhere else in this file.
 */
interface JobCostDetailRow {
  jobId: string;
  jobNumber: string;
  customerName: string;
  completedAt: Date;
  revenue: string;
  actualCost: string;
  laborCost: string;
  chemicalCost: string;
  equipmentCost: string;
  fuelCost: string;
  miscCost: string;
  grossProfit: string;
  grossMarginPercent: string | null;
  isComplete: boolean;
}

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
        FROM payments WHERE company_id = ${companyId}::uuid AND status = 'succeeded' AND COALESCE(payment_date, processed_at) >= date_trunc('month', now())
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
  /**
   * Reporting verification gate, Decision 1: "Average Ticket" was
   * previously sourced from accepted estimate value — confirmed wrong
   * against the authoritative definition (Completed Job Revenue ÷
   * Completed Jobs). Fixed here. The old calculation is preserved, not
   * deleted, under its own honest name (averageAcceptedEstimateValue)
   * — a real, useful number, just never "Average Ticket."
   * jobs.price is the source for job revenue: set once at job creation
   * directly from the originating estimate's post-tax total (see
   * JobsService.createFromEstimate) and never modified afterward, since
   * job line items are write-once. Deliberately NOT
   * SUM(job_line_items.total) — that's a pre-tax subtotal, the exact
   * figure Job Cost & Gross Margin's own "revenue" already uses for its
   * own (separate, approved, unchanged) purpose. Average Ticket and Job
   * Cost's "revenue" are allowed to differ in basis; both are
   * documented explicitly in REPORTING_DEFINITIONS.md so neither reads
   * as a silent inconsistency.
   */
  async getPeriodKpis(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const estimates: any[] = await tx.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('sent','viewed','accepted','declined','expired')) AS "estimatesSent",
          COUNT(*) FILTER (WHERE status = 'accepted') AS "estimatesAccepted",
          COALESCE(AVG(total_amount) FILTER (WHERE status = 'accepted'), 0) AS "averageAcceptedEstimateValue",
          COALESCE(SUM(total_amount) FILTER (WHERE status = 'accepted'), 0) AS "acceptedEstimateValue"
        FROM estimates WHERE company_id = ${companyId}::uuid AND created_at >= ${start} AND created_at < ${end}
      `;
      const sentCount = Number(estimates[0]?.estimatesSent ?? 0);
      const acceptedCount = Number(estimates[0]?.estimatesAccepted ?? 0);

      const jobs: any[] = await tx.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE status = 'completed' AND actual_end >= ${start} AND actual_end < ${end}) AS "jobsCompleted",
          COUNT(*) FILTER (WHERE scheduled_start >= ${start} AND scheduled_start < ${end}) AS "jobsScheduled",
          COALESCE(AVG(EXTRACT(EPOCH FROM (actual_end - actual_start)) / 3600) FILTER (WHERE status = 'completed' AND actual_end >= ${start} AND actual_end < ${end}), 0) AS "averageJobDurationHours",
          COALESCE(SUM(billable_labor_hours) FILTER (WHERE status = 'completed' AND actual_end >= ${start} AND actual_end < ${end}), 0) AS "totalLaborHours",
          COALESCE(AVG(price) FILTER (WHERE status = 'completed' AND actual_end >= ${start} AND actual_end < ${end}), 0) AS "averageTicket"
        FROM jobs WHERE company_id = ${companyId}::uuid
      `;

      return {
        estimateConversionRatePercent: sentCount > 0 ? Math.round((acceptedCount / sentCount) * 10000) / 100 : null,
        estimatesSent: sentCount,
        estimatesAccepted: acceptedCount,
        averageAcceptedEstimateValue: Number(estimates[0]?.averageAcceptedEstimateValue ?? 0),
        acceptedEstimateValue: Number(estimates[0]?.acceptedEstimateValue ?? 0),
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
      SELECT date_trunc('day', COALESCE(payment_date, processed_at))::date AS "date", SUM(amount) AS "amount"
      FROM payments
      WHERE company_id = ${companyId}::uuid AND status = 'succeeded' AND COALESCE(payment_date, processed_at) >= ${start} AND COALESCE(payment_date, processed_at) < ${end}
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
   * Repeat rate and average time between services are genuinely new
   * calculations (nothing upstream computes these today), but every
   * input is a column that already exists — jobs.actual_end,
   * jobs.customer_id. Point-in-time across the whole customer base, not
   * range-bound: "is this customer a repeat customer" has one real
   * answer regardless of what date range a report happens to be viewed
   * with.
   *
   * Lifetime Value here reads customers.lifetime_value directly — the
   * SAME maintained, payments-based column getLeadSourceAnalytics()
   * already correctly uses. This method previously computed its own
   * separate, invoice-based figure (SUM(invoices.total_amount)) instead
   * — a real, confirmed correctness bug found during the reporting-
   * foundation audit: two methods in this same file disagreeing about
   * what "lifetime value" means, one representing money billed, the
   * other money actually collected. Per the approved authoritative
   * definition (see docs/REPORTING_DEFINITIONS.md), Customer Lifetime
   * Value means collected revenue, net of refunds/voids — exactly what
   * customers.lifetime_value already tracks (see payments.service.ts's
   * three increment/decrement call sites). Fixed here, not left as a
   * second inconsistent implementation.
   */
  async getCustomerAnalytics(companyId: string) {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const summary: any[] = await tx.$queryRaw`
        WITH customer_job_counts AS (
          SELECT customer_id, COUNT(*) AS job_count
          FROM jobs WHERE company_id = ${companyId}::uuid AND status = 'completed'
          GROUP BY customer_id
        )
        SELECT
          COUNT(*) FILTER (WHERE cjc.job_count > 1) AS "repeatCustomerCount",
          COUNT(*) AS "totalActiveCustomers",
          COALESCE(AVG(c.lifetime_value), 0) AS "averageLifetimeValue"
        FROM customer_job_counts cjc
        JOIN customers c ON c.id = cjc.customer_id AND c.company_id = ${companyId}::uuid
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

  // =========================================================================
  // Job Cost & Gross Margin — the one report this module genuinely could
  // NOT honestly support until the reporting-foundation phase added
  // job_line_items.actual_* columns. getSnapshotKpis/getMonthlyProfitTrend
  // above still intentionally use estimate_line_items.estimated_profit —
  // that's correct for THOSE endpoints (a forward-looking snapshot of
  // what's been quoted), left untouched here. This section is the actual,
  // completed-work figure: real dollars spent, only for jobs where
  // someone has actually recorded them.
  // =========================================================================

  /**
   * Per-job actual cost/profit, restricted to completed jobs with real
   * actual-cost data recorded on at least one line item — a job with
   * zero actual-cost entries is completely absent from this list, never
   * shown with a fabricated $0 cost. Reflects the exact CRITICAL COST
   * RULE from the approval doc: no estimated cost ever appears here
   * relabeled as actual.
   *
   * Explicitly typed via the JobCostDetailRow generic on $queryRaw —
   * without it, TypeScript infers `unknown` for the raw query result,
   * which only surfaces as a real tsc error at the ONE place that
   * calls .length/.filter/.reduce on this method's return value
   * (getJobCostSummary below). Confirmed by a real `tsc --noEmit` run;
   * not caught in this sandbox since Prisma's client couldn't be
   * regenerated here to verify against.
   */
  async getJobCostDetail(companyId: string, start: Date, end: Date): Promise<JobCostDetailRow[]> {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw<JobCostDetailRow[]>`
      WITH job_costs AS (
        SELECT
          jli.job_id,
          SUM(jli.total) AS revenue,
          SUM(COALESCE(jli.actual_labor_hours, 0) *
              COALESCE((SELECT hourly_labor_rate FROM users WHERE id = jli.assigned_user_id), (SELECT default_labor_rate FROM companies WHERE id = ${companyId}::uuid), 0)
          ) AS labor_cost,
          SUM(COALESCE(jli.actual_chemical_cost, 0)) AS chemical_cost,
          SUM(COALESCE(jli.actual_equipment_cost, 0)) AS equipment_cost,
          SUM(COALESCE(jli.actual_fuel_cost, 0)) AS fuel_cost,
          SUM(COALESCE(jli.actual_misc_cost, 0)) AS misc_cost,
          -- "Has real data" means at least one line item on the job has
          -- at least one actual_* field recorded — matches
          -- JobsService.applyJobProfitabilityVisibility's own
          -- linesWithCost definition exactly, not a second definition
          -- of "complete" invented here.
          BOOL_OR(jli.actual_labor_hours IS NOT NULL OR jli.actual_chemical_cost IS NOT NULL OR jli.actual_equipment_cost IS NOT NULL
                  OR jli.actual_fuel_cost IS NOT NULL OR jli.actual_misc_cost IS NOT NULL) AS has_actual_cost_data,
          COUNT(*) AS line_item_count,
          COUNT(*) FILTER (WHERE jli.actual_labor_hours IS NOT NULL OR jli.actual_chemical_cost IS NOT NULL OR jli.actual_equipment_cost IS NOT NULL
                  OR jli.actual_fuel_cost IS NOT NULL OR jli.actual_misc_cost IS NOT NULL) AS line_items_with_cost
        FROM job_line_items jli
        WHERE jli.company_id = ${companyId}::uuid
        GROUP BY jli.job_id
      )
      SELECT
        j.id AS "jobId", j.job_number AS "jobNumber",
        COALESCE(c.business_name, c.first_name || ' ' || c.last_name) AS "customerName",
        j.actual_end AS "completedAt",
        jc.revenue,
        (jc.labor_cost + jc.chemical_cost + jc.equipment_cost + jc.fuel_cost + jc.misc_cost) AS "actualCost",
        jc.labor_cost AS "laborCost", jc.chemical_cost AS "chemicalCost", jc.equipment_cost AS "equipmentCost",
        jc.fuel_cost AS "fuelCost", jc.misc_cost AS "miscCost",
        (jc.revenue - (jc.labor_cost + jc.chemical_cost + jc.equipment_cost + jc.fuel_cost + jc.misc_cost)) AS "grossProfit",
        CASE WHEN jc.revenue > 0 THEN ROUND((jc.revenue - (jc.labor_cost + jc.chemical_cost + jc.equipment_cost + jc.fuel_cost + jc.misc_cost)) / jc.revenue * 100, 2) ELSE NULL END AS "grossMarginPercent",
        (jc.line_items_with_cost = jc.line_item_count) AS "isComplete"
      FROM job_costs jc
      JOIN jobs j ON j.id = jc.job_id AND j.company_id = ${companyId}::uuid
      JOIN customers c ON c.id = j.customer_id AND c.company_id = ${companyId}::uuid
      WHERE j.status = 'completed' AND j.actual_end >= ${start} AND j.actual_end < ${end} AND jc.has_actual_cost_data = true
      ORDER BY "grossProfit" ASC
    `);
  }

  /**
   * The summary card for the Job Cost & Gross Margin report — same
   * "only count jobs with real data, state the completeness fraction
   * plainly" rule as the detail query above, aggregated. completedJobs
   * in this period vs. jobsWithCostData directly implements the
   * approval doc's own example: "Actual cost available for 83 of 91
   * completed jobs."
   */
  async getJobCostSummary(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const completed: any[] = await tx.$queryRaw`
        SELECT COUNT(*) AS "completedJobs" FROM jobs
        WHERE company_id = ${companyId}::uuid AND status = 'completed' AND actual_end >= ${start} AND actual_end < ${end}
      `;

      const detail: JobCostDetailRow[] = await this.getJobCostDetail(companyId, start, end);
      const jobsWithCostData = detail.length;
      const completeJobs = detail.filter((j) => j.isComplete).length;
      const totalRevenue = detail.reduce((sum, j) => sum + Number(j.revenue), 0);
      const totalActualCost = detail.reduce((sum, j) => sum + Number(j.actualCost), 0);
      const totalGrossProfit = totalRevenue - totalActualCost;

      return {
        completedJobs: Number(completed[0]?.completedJobs ?? 0),
        jobsWithCostData,
        completeJobs, // has actual cost on every line item, not just at least one
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalActualCost: Math.round(totalActualCost * 100) / 100,
        totalGrossProfit: jobsWithCostData > 0 ? Math.round(totalGrossProfit * 100) / 100 : null,
        grossMarginPercent: jobsWithCostData > 0 && totalRevenue > 0 ? Math.round((totalGrossProfit / totalRevenue) * 10000) / 100 : null,
      };
    });
  }

  /**
   * Minimal — Report #10 (Satisfaction & Callbacks) needs this for the
   * Owner Scorecard's Customer Rating KPI. Reviews with no rating
   * (platform submitted text-only feedback, or a review sync that
   * hasn't captured a star value) are correctly excluded from the
   * average rather than counted as a 0-star review.
   */
  async getCustomerSatisfactionSummary(companyId: string, start: Date, end: Date) {
    const rows: any[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT
        COUNT(*) FILTER (WHERE rating IS NOT NULL) AS "ratedReviewCount",
        COALESCE(AVG(rating) FILTER (WHERE rating IS NOT NULL), 0) AS "averageRating",
        COUNT(*) FILTER (WHERE rating = 5) AS "fiveStarCount"
      FROM reviews
      WHERE company_id = ${companyId}::uuid AND COALESCE(review_date, created_at) >= ${start} AND COALESCE(review_date, created_at) < ${end}
    `);
    const ratedReviewCount = Number(rows[0]?.ratedReviewCount ?? 0);
    const fiveStarCount = Number(rows[0]?.fiveStarCount ?? 0);
    return {
      ratedReviewCount,
      averageRating: ratedReviewCount > 0 ? Math.round(Number(rows[0]?.averageRating ?? 0) * 10) / 10 : null,
      fiveStarPercent: ratedReviewCount > 0 ? Math.round((fiveStarCount / ratedReviewCount) * 1000) / 10 : null,
    };
  }

  // =========================================================================
  // Reporting Center Phase 3, Group 1 — Revenue & Sales, Estimate Conversion,
  // Average Ticket. Every new method here reuses the exact conventions
  // already established: jobs.price as the Average Ticket revenue basis
  // (see REPORTING_DEFINITIONS.md), withTenantContext + explicit
  // company_id filtering (never RLS alone), null-vs-zero preserved for
  // any incomplete-data case.
  // =========================================================================

  /**
   * Revenue by Technician — mirrors getRevenueByService/getRevenueByCustomer
   * exactly, but sourced from jobs.price (Average Ticket's revenue basis),
   * not invoice_line_items — a technician's "revenue" here means the jobs
   * they actually completed, not an invoice-line attribution that doesn't
   * exist at the per-technician level anywhere else in this schema.
   */
  async getRevenueByTechnician(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT u.id AS "technicianId", u.first_name AS "firstName", u.last_name AS "lastName",
             COUNT(*) AS "jobsCompleted", COALESCE(SUM(j.price), 0) AS "revenue",
             COALESCE(AVG(j.price), 0) AS "averageTicket"
      FROM jobs j
      JOIN users u ON u.id = j.assigned_user_id
      WHERE j.company_id = ${companyId}::uuid AND j.status = 'completed'
        AND j.actual_end >= ${start} AND j.actual_end < ${end} AND j.assigned_user_id IS NOT NULL
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY "revenue" DESC
    `);
  }

  /**
   * Estimate Conversion detail. Date basis note (flagged, not silently
   * resolved, per the audit's explicit instruction): "average time to
   * acceptance" is computed as accepted_at - created_at — the estimate's
   * full lifecycle from creation to acceptance, not sent_at - accepted_at
   * (which would measure only "time since the customer actually saw the
   * offer"). Both are defensible; created_at was chosen because it's the
   * same date basis every other figure on this page already uses
   * (Total/Accepted/Declined/Pending/Expired all bucket by created_at),
   * so a mixed-basis "time to acceptance" next to them would be its own
   * silent inconsistency. If sent-to-accepted turns out to be the more
   * useful number for a future iteration, it's a one-column addition, not
   * a rework — flagged here rather than picked in either direction
   * without saying so.
   */
  async getEstimateConversionDetail(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const rows: any[] = await tx.$queryRaw`
        SELECT
          COUNT(*) AS "total",
          COUNT(*) FILTER (WHERE status = 'accepted') AS "accepted",
          COUNT(*) FILTER (WHERE status = 'declined') AS "declined",
          COUNT(*) FILTER (WHERE status IN ('sent', 'viewed')) AS "pending",
          COUNT(*) FILTER (WHERE status = 'expired') AS "expired",
          COALESCE(SUM(total_amount) FILTER (WHERE status = 'accepted'), 0) AS "acceptedValue",
          COALESCE(SUM(total_amount) FILTER (WHERE status IN ('declined', 'expired')), 0) AS "lostValue",
          COALESCE(AVG(total_amount) FILTER (WHERE status = 'accepted'), 0) AS "averageAcceptedValue",
          COALESCE(AVG(EXTRACT(EPOCH FROM (accepted_at - created_at)) / 86400) FILTER (WHERE status = 'accepted' AND accepted_at IS NOT NULL), 0) AS "averageDaysToAcceptance"
        FROM estimates
        WHERE company_id = ${companyId}::uuid AND created_at >= ${start} AND created_at < ${end}
      `;
      const r = rows[0] ?? {};
      const total = Number(r.total ?? 0);
      const accepted = Number(r.accepted ?? 0);
      return {
        total,
        accepted,
        declined: Number(r.declined ?? 0),
        pending: Number(r.pending ?? 0),
        expired: Number(r.expired ?? 0),
        conversionRatePercent: total > 0 ? Math.round((accepted / total) * 10000) / 100 : null,
        acceptedValue: Number(r.acceptedValue ?? 0),
        lostValue: Number(r.lostValue ?? 0),
        averageAcceptedValue: Number(r.averageAcceptedValue ?? 0),
        averageDaysToAcceptance: Math.round(Number(r.averageDaysToAcceptance ?? 0) * 10) / 10,
      };
    });
  }

  /** Estimate Conversion by service — which services convert best, not just which sell for the most. */
  async getEstimateConversionByService(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT COALESCE(sci.name, eli.service_type, 'Other') AS "serviceName",
             COUNT(DISTINCT e.id) AS "total",
             COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'accepted') AS "accepted"
      FROM estimate_line_items eli
      JOIN estimates e ON e.id = eli.estimate_id AND e.company_id = ${companyId}::uuid
      LEFT JOIN service_catalog_items sci ON sci.id = eli.service_catalog_item_id
      WHERE eli.company_id = ${companyId}::uuid AND e.created_at >= ${start} AND e.created_at < ${end}
      GROUP BY 1 ORDER BY "total" DESC
      LIMIT 15
    `);
  }

  /**
   * Average Ticket detail — overall stats plus min/max/median. Uses the
   * same jobs.price basis as getPeriodKpis's averageTicket (see
   * REPORTING_DEFINITIONS.md) — one calculation, reused, not
   * reimplemented with different math on this dedicated page.
   */
  async getAverageTicketDetail(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, async (tx) => {
      const rows: any[] = await tx.$queryRaw`
        SELECT
          COUNT(*) AS "completedJobs",
          COALESCE(SUM(price), 0) AS "totalRevenue",
          COALESCE(AVG(price), 0) AS "averageTicket",
          COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price), 0) AS "medianTicket",
          COALESCE(MAX(price), 0) AS "highestTicket",
          COALESCE(MIN(price), 0) AS "lowestTicket"
        FROM jobs
        WHERE company_id = ${companyId}::uuid AND status = 'completed' AND actual_end >= ${start} AND actual_end < ${end}
      `;
      const r = rows[0] ?? {};
      return {
        completedJobs: Number(r.completedJobs ?? 0),
        totalRevenue: Number(r.totalRevenue ?? 0),
        averageTicket: Number(r.averageTicket ?? 0),
        medianTicket: Number(r.medianTicket ?? 0),
        highestTicket: Number(r.highestTicket ?? 0),
        lowestTicket: Number(r.lowestTicket ?? 0),
      };
    });
  }

  /** Average Ticket by service — jobs.price attributed via the job's primary service_type, the same field JobsService sets at creation from the first line item. Not a per-line-item split (a job's price is one number, not divisible cleanly across services within it). */
  async getAverageTicketByService(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT COALESCE(service_type, 'Other') AS "serviceName", COUNT(*) AS "jobsCompleted",
             COALESCE(AVG(price), 0) AS "averageTicket", COALESCE(SUM(price), 0) AS "totalRevenue"
      FROM jobs
      WHERE company_id = ${companyId}::uuid AND status = 'completed' AND actual_end >= ${start} AND actual_end < ${end}
      GROUP BY 1 ORDER BY "totalRevenue" DESC
    `);
  }

  // =========================================================================
  // Reporting Center Phase 3, Group 2 — Service Profitability.
  //
  // Revenue/cost/grain decisions, made explicit rather than re-derived
  // silently:
  //
  // GRAIN: job_line_items is many rows per job. The CTE below (byte-
  // identical to getJobCostDetail's own job_costs CTE — not a second,
  // possibly-divergent implementation) aggregates every job down to
  // exactly one row FIRST, before any join to jobs or any GROUP BY
  // service — so a job with 4 line items contributes its true $500
  // revenue once, never $2,000. Service is then attributed at the JOB
  // level via jobs.service_type (COALESCE'd to 'Other'), the same
  // single-value-per-job field getAverageTicketByService already uses —
  // not a per-line-item service split, which would fragment one job's
  // revenue/cost across multiple service buckets and reintroduce the
  // exact multiplication risk this section warns against.
  //
  // REVENUE/COST BASIS: mirrors getJobCostSummary's own already-approved
  // resolution exactly — Revenue, Actual Cost, Gross Profit, and Average
  // Ticket are ALL computed only from jobs that have real actual-cost
  // data (has_actual_cost_data = true), keeping numerator and
  // denominator on one consistent basis. Total completed job count is
  // reported separately, unrestricted, purely for the completeness
  // fraction — never blended into the revenue/profit figures themselves.
  // The alternative (Revenue from all completed jobs, Cost only from
  // the subset with data) would silently overstate margin by comparing
  // two different job sets against each other — worse than the honest
  // "smaller but consistent" figure this uses instead.
  // =========================================================================

  async getServiceProfitability(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      WITH job_costs AS (
        SELECT
          jli.job_id,
          SUM(jli.total) AS revenue,
          SUM(COALESCE(jli.actual_labor_hours, 0) *
              COALESCE((SELECT hourly_labor_rate FROM users WHERE id = jli.assigned_user_id), (SELECT default_labor_rate FROM companies WHERE id = ${companyId}::uuid), 0)
          ) AS labor_cost,
          SUM(COALESCE(jli.actual_chemical_cost, 0)) AS chemical_cost,
          SUM(COALESCE(jli.actual_equipment_cost, 0)) AS equipment_cost,
          SUM(COALESCE(jli.actual_fuel_cost, 0)) AS fuel_cost,
          SUM(COALESCE(jli.actual_misc_cost, 0)) AS misc_cost,
          BOOL_OR(jli.actual_labor_hours IS NOT NULL OR jli.actual_chemical_cost IS NOT NULL OR jli.actual_equipment_cost IS NOT NULL
                  OR jli.actual_fuel_cost IS NOT NULL OR jli.actual_misc_cost IS NOT NULL) AS has_actual_cost_data
        FROM job_line_items jli
        WHERE jli.company_id = ${companyId}::uuid
        GROUP BY jli.job_id
      ),
      eligible_jobs AS (
        SELECT
          j.id,
          COALESCE(j.service_type, 'Other') AS service_name,
          jc.revenue,
          (jc.labor_cost + jc.chemical_cost + jc.equipment_cost + jc.fuel_cost + jc.misc_cost) AS actual_cost,
          COALESCE(jc.has_actual_cost_data, false) AS has_actual_cost_data
        FROM jobs j
        LEFT JOIN job_costs jc ON jc.job_id = j.id
        WHERE j.company_id = ${companyId}::uuid AND j.status = 'completed'
          AND j.actual_end >= ${start} AND j.actual_end < ${end}
      )
      SELECT
        service_name AS "serviceName",
        COUNT(*) AS "totalJobs",
        COUNT(*) FILTER (WHERE has_actual_cost_data) AS "jobsWithCostData",
        COALESCE(SUM(revenue) FILTER (WHERE has_actual_cost_data), 0) AS "revenue",
        COALESCE(SUM(actual_cost) FILTER (WHERE has_actual_cost_data), 0) AS "actualCost",
        COALESCE(SUM(revenue - actual_cost) FILTER (WHERE has_actual_cost_data), 0) AS "grossProfit",
        CASE WHEN COALESCE(SUM(revenue) FILTER (WHERE has_actual_cost_data), 0) > 0
          THEN ROUND(COALESCE(SUM(revenue - actual_cost) FILTER (WHERE has_actual_cost_data), 0)
                     / SUM(revenue) FILTER (WHERE has_actual_cost_data) * 100, 2)
          ELSE NULL END AS "grossMarginPercent",
        CASE WHEN COUNT(*) FILTER (WHERE has_actual_cost_data) > 0
          THEN ROUND(COALESCE(SUM(revenue) FILTER (WHERE has_actual_cost_data), 0) / COUNT(*) FILTER (WHERE has_actual_cost_data), 2)
          ELSE NULL END AS "averageTicket"
      FROM eligible_jobs
      GROUP BY service_name
      ORDER BY "grossProfit" DESC NULLS LAST
    `);
  }

  /**
   * Drill-down: the completed jobs behind one service's row above,
   * within the same date range. Reuses the exact same job_costs CTE and
   * per-job formula getJobCostDetail already uses — not a second
   * profitability calculation. Summing this result's revenue/cost/
   * profit for jobs where isComplete-eligible (hasActualCostData) must
   * reconcile exactly with the summary row's totals, since both are
   * built from the identical CTE and the identical has_actual_cost_data
   * filter — this is what the "drill-down trust requirement" asks for,
   * satisfied structurally rather than by a separate reconciliation step.
   */
  async getServiceProfitabilityDrilldown(companyId: string, start: Date, end: Date, serviceName: string) {
    // 'Other' (the COALESCE fallback label used everywhere else in this
    // file) maps back to a real NULL service_type here — IS NOT
    // DISTINCT FROM matches NULL-to-NULL correctly in one clean
    // expression, unlike `=` (which never matches NULL to anything,
    // including another NULL) or the more fragile boolean-flag OR/AND
    // combination an earlier draft of this method used.
    const matchValue = serviceName === 'Other' ? null : serviceName;
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      WITH job_costs AS (
        SELECT
          jli.job_id,
          SUM(jli.total) AS revenue,
          SUM(COALESCE(jli.actual_labor_hours, 0) *
              COALESCE((SELECT hourly_labor_rate FROM users WHERE id = jli.assigned_user_id), (SELECT default_labor_rate FROM companies WHERE id = ${companyId}::uuid), 0)
          ) AS labor_cost,
          SUM(COALESCE(jli.actual_chemical_cost, 0)) AS chemical_cost,
          SUM(COALESCE(jli.actual_equipment_cost, 0)) AS equipment_cost,
          SUM(COALESCE(jli.actual_fuel_cost, 0)) AS fuel_cost,
          SUM(COALESCE(jli.actual_misc_cost, 0)) AS misc_cost,
          BOOL_OR(jli.actual_labor_hours IS NOT NULL OR jli.actual_chemical_cost IS NOT NULL OR jli.actual_equipment_cost IS NOT NULL
                  OR jli.actual_fuel_cost IS NOT NULL OR jli.actual_misc_cost IS NOT NULL) AS has_actual_cost_data
        FROM job_line_items jli
        WHERE jli.company_id = ${companyId}::uuid
        GROUP BY jli.job_id
      )
      SELECT
        j.id AS "jobId", j.job_number AS "jobNumber",
        COALESCE(c.business_name, c.first_name || ' ' || c.last_name) AS "customerName",
        j.actual_end AS "completedAt",
        COALESCE(j.service_type, 'Other') AS "serviceName",
        COALESCE(jc.revenue, 0) AS revenue,
        jc.labor_cost AS "laborCost", jc.chemical_cost AS "chemicalCost", jc.equipment_cost AS "equipmentCost",
        jc.fuel_cost AS "fuelCost", jc.misc_cost AS "miscCost",
        (COALESCE(jc.labor_cost, 0) + COALESCE(jc.chemical_cost, 0) + COALESCE(jc.equipment_cost, 0) + COALESCE(jc.fuel_cost, 0) + COALESCE(jc.misc_cost, 0)) AS "actualCost",
        CASE WHEN COALESCE(jc.has_actual_cost_data, false)
          THEN COALESCE(jc.revenue, 0) - (COALESCE(jc.labor_cost, 0) + COALESCE(jc.chemical_cost, 0) + COALESCE(jc.equipment_cost, 0) + COALESCE(jc.fuel_cost, 0) + COALESCE(jc.misc_cost, 0))
          ELSE NULL END AS "grossProfit",
        CASE WHEN COALESCE(jc.has_actual_cost_data, false) AND COALESCE(jc.revenue, 0) > 0
          THEN ROUND((COALESCE(jc.revenue, 0) - (COALESCE(jc.labor_cost, 0) + COALESCE(jc.chemical_cost, 0) + COALESCE(jc.equipment_cost, 0) + COALESCE(jc.fuel_cost, 0) + COALESCE(jc.misc_cost, 0))) / jc.revenue * 100, 2)
          ELSE NULL END AS "grossMarginPercent",
        COALESCE(jc.has_actual_cost_data, false) AS "hasActualCostData"
      FROM jobs j
      LEFT JOIN job_costs jc ON jc.job_id = j.id
      JOIN customers c ON c.id = j.customer_id AND c.company_id = ${companyId}::uuid
      WHERE j.company_id = ${companyId}::uuid AND j.status = 'completed'
        AND j.actual_end >= ${start} AND j.actual_end < ${end}
        AND j.service_type IS NOT DISTINCT FROM ${matchValue}
      ORDER BY j.actual_end DESC
    `);
  }

  // =========================================================================
  // Reporting Center Phase 3, Group 3 — Customer Lifetime Value, Repeat &
  // Recurring Customers, Satisfaction & Callbacks.
  // =========================================================================

  /**
   * Customer LTV table. Deliberately NOT date-range-bound — same
   * "lifetime is point-in-time, not period-filtered" precedent
   * getCustomerAnalytics already established (see that method's own
   * comment). customers.lifetime_value is the single authoritative CLV
   * source (payments-based, auto-maintained), reused directly — not a
   * second calculation. Average ticket here uses jobs.price (the same
   * basis every other Average Ticket figure in this reporting phase
   * uses), independently of lifetime_value, since lifetime_value is
   * collected-payments-based while average ticket is job-price-based —
   * two different, both-legitimate bases for two different questions,
   * not a silent inconsistency.
   */
  async getCustomerLtvTable(companyId: string) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      WITH job_stats AS (
        SELECT customer_id, COUNT(*) AS job_count, COALESCE(AVG(price), 0) AS avg_ticket,
               MIN(actual_end) AS first_job, MAX(actual_end) AS last_job
        FROM jobs WHERE company_id = ${companyId}::uuid AND status = 'completed'
        GROUP BY customer_id
      )
      SELECT
        c.id AS "customerId",
        COALESCE(c.business_name, c.first_name || ' ' || c.last_name) AS "customerName",
        c.lifetime_value AS "lifetimeRevenue",
        COALESCE(js.job_count, 0) AS "completedJobs",
        COALESCE(js.avg_ticket, 0) AS "averageTicket",
        js.first_job AS "firstJob",
        js.last_job AS "lastJob"
      FROM customers c
      LEFT JOIN job_stats js ON js.customer_id = c.id
      WHERE c.company_id = ${companyId}::uuid AND c.deleted_at IS NULL
      ORDER BY "lifetimeRevenue" DESC
    `);
  }

  /** Summary KPIs for the LTV table above — median via PERCENTILE_CONT, reliably computable in one query, so it's included per the spec's own "only if the backend can calculate it reliably" condition. */
  async getCustomerLtvSummary(companyId: string) {
    const rows: any[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT
        COUNT(*) AS "totalCustomers",
        COALESCE(SUM(lifetime_value), 0) AS "totalLifetimeRevenue",
        COALESCE(AVG(lifetime_value), 0) AS "averageLtv",
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lifetime_value), 0) AS "medianLtv"
      FROM customers WHERE company_id = ${companyId}::uuid AND deleted_at IS NULL
    `);
    return {
      totalCustomers: Number(rows[0]?.totalCustomers ?? 0),
      totalLifetimeRevenue: Number(rows[0]?.totalLifetimeRevenue ?? 0),
      averageLtv: Math.round(Number(rows[0]?.averageLtv ?? 0) * 100) / 100,
      medianLtv: Math.round(Number(rows[0]?.medianLtv ?? 0) * 100) / 100,
      // High-Value Customers KPI deliberately omitted — no existing
      // Renovo-defined dollar threshold exists for this, and the spec
      // explicitly says not to invent one.
    };
  }

  /**
   * Repeat & Recurring Customers table. Repeat = completed job count > 1,
   * the exact definition getCustomerAnalytics already established —
   * reused inline here (same job_stats CTE shape), not redefined.
   * hasRequestedRecurring is a real, stored signal (ServiceRequest.
   * is_recurring, ever true for this customer) — not an inferred
   * schedule from gaps between historical jobs, which the spec
   * explicitly forbids. Next-due-date and recurring revenue are
   * deliberately not computed here at all — see the frontend page for
   * why (no reliable per-customer schedule exists in today's data
   * model to compute either from).
   */
  async getRepeatCustomersTable(companyId: string) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      WITH job_stats AS (
        SELECT customer_id, COUNT(*) AS job_count, MIN(actual_end) AS first_job, MAX(actual_end) AS last_job
        FROM jobs WHERE company_id = ${companyId}::uuid AND status = 'completed'
        GROUP BY customer_id
      ),
      recurring_interest AS (
        SELECT DISTINCT customer_id FROM service_requests WHERE company_id = ${companyId}::uuid AND is_recurring = true
      )
      SELECT
        c.id AS "customerId",
        COALESCE(c.business_name, c.first_name || ' ' || c.last_name) AS "customerName",
        COALESCE(js.job_count, 0) AS "completedJobs",
        c.lifetime_value AS "lifetimeRevenue",
        js.first_job AS "firstJob",
        js.last_job AS "lastJob",
        (COALESCE(js.job_count, 0) > 1) AS "isRepeat",
        (ri.customer_id IS NOT NULL) AS "hasRequestedRecurring"
      FROM customers c
      LEFT JOIN job_stats js ON js.customer_id = c.id
      LEFT JOIN recurring_interest ri ON ri.customer_id = c.id
      WHERE c.company_id = ${companyId}::uuid AND c.deleted_at IS NULL AND COALESCE(js.job_count, 0) > 0
      ORDER BY "completedJobs" DESC, "lifetimeRevenue" DESC
    `);
  }

  /** KPI summary for Repeat & Recurring Customers — reuses getCustomerAnalytics's own repeat-rate logic exactly (called directly, not reimplemented) plus a couple of straightforward additional counts. */
  async getRepeatCustomersSummary(companyId: string) {
    const analytics = await this.getCustomerAnalytics(companyId);
    const rows: any[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      WITH job_stats AS (
        SELECT customer_id, COUNT(*) AS job_count
        FROM jobs WHERE company_id = ${companyId}::uuid AND status = 'completed'
        GROUP BY customer_id
      )
      SELECT
        COUNT(*) AS "totalCustomersWithJobs",
        COALESCE(AVG(job_count), 0) AS "averageJobsPerCustomer",
        COUNT(*) FILTER (WHERE job_count >= 2) AS "customersWithTwoPlusJobs"
      FROM job_stats
    `);
    return {
      totalCustomers: analytics.totalActiveCustomers,
      repeatCustomers: analytics.repeatCustomerCount,
      repeatCustomerRatePercent: analytics.repeatCustomerRatePercent,
      averageJobsPerCustomer: Math.round(Number(rows[0]?.averageJobsPerCustomer ?? 0) * 10) / 10,
      customersWithTwoPlusJobs: Number(rows[0]?.customersWithTwoPlusJobs ?? 0),
    };
  }

  /**
   * Callback list with real cost data — JobCallback already has
   * additionalLaborCost/additionalMaterialCost/refundAmount columns
   * (confirmed by reading the schema, not assumed absent), so this
   * shows them directly rather than displaying a "Not Yet Available"
   * that isn't actually true.
   */
  async getCallbackList(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT
        jc.id AS "callbackId", j.id AS "jobId", j.job_number AS "jobNumber",
        COALESCE(c.business_name, c.first_name || ' ' || c.last_name) AS "customerName",
        COALESCE(j.service_type, 'Other') AS "serviceName",
        j.actual_end AS "originalJobDate", jc.reason, jc.status,
        (COALESCE(jc.additional_labor_cost, 0) + COALESCE(jc.additional_material_cost, 0) + COALESCE(jc.refund_amount, 0)) AS "callbackCost"
      FROM job_callbacks jc
      JOIN jobs j ON j.id = jc.original_job_id AND j.company_id = ${companyId}::uuid
      JOIN customers c ON c.id = jc.customer_id AND c.company_id = ${companyId}::uuid
      WHERE jc.company_id = ${companyId}::uuid AND j.actual_end >= ${start} AND j.actual_end < ${end}
      ORDER BY j.actual_end DESC
    `);
  }

  /** Review list with rating per job/customer — "Not Rated" (null), never a fabricated 0, for jobs with no review yet. */
  async getReviewList(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      SELECT
        r.id AS "reviewId",
        COALESCE(c.business_name, c.first_name || ' ' || c.last_name) AS "customerName",
        j.id AS "jobId", j.job_number AS "jobNumber", COALESCE(j.service_type, 'Other') AS "serviceName",
        COALESCE(r.review_date, r.created_at) AS "reviewDate", r.rating,
        (SELECT COUNT(*) FROM job_callbacks jc WHERE jc.original_job_id = j.id) > 0 AS "hadCallback"
      FROM reviews r
      LEFT JOIN jobs j ON j.id = r.job_id AND j.company_id = ${companyId}::uuid
      LEFT JOIN customers c ON c.id = r.customer_id AND c.company_id = ${companyId}::uuid
      WHERE r.company_id = ${companyId}::uuid AND COALESCE(r.review_date, r.created_at) >= ${start} AND COALESCE(r.review_date, r.created_at) < ${end}
      ORDER BY "reviewDate" DESC
    `);
  }

  // =========================================================================
  // Reporting Center Phase 3, Group 4 — Technician Performance, Route & Job
  // Efficiency.
  //
  // Labor Hours source decision, made explicit: jobs.billable_labor_hours
  // (not SUM(job_line_items.actual_labor_hours)) is used for every "Labor
  // Hours" figure in this group — this is the SAME field the pre-existing
  // getTechnicianPerformance() already used, not a new choice. The two
  // labor-hour sources in this schema serve genuinely different purposes:
  // billable_labor_hours is job-level, time-clock-derived (actual_end -
  // actual_start, staff-overridable at completion — see JobsService.complete),
  // meant to answer "how many hours of work did this job take." job_line_items
  // .actual_labor_hours is per-line-item, staff-entered specifically for
  // cost attribution (hours x rate = labor cost within Job Cost/Service
  // Profitability's formula), and was never meant to represent total job
  // duration. Using billable_labor_hours for "Labor Hours" and the existing
  // job_costs CTE for "Gross Profit/Margin" combines two already-authoritative,
  // different-purpose sources correctly — not a new, third calculation.
  // =========================================================================

  /**
   * Technician Performance detail — reuses the identical job_costs CTE
   * from getJobCostDetail/getServiceProfitability (same revenue/cost
   * basis, same has_actual_cost_data completeness rule), grouped by
   * jobs.assigned_user_id instead of service_type. Revenue/Cost/Profit/
   * Margin/Average Ticket are computed only from jobs with real cost
   * data (identical resolution to Service Profitability — see that
   * method's own comment for the full reasoning); totalJobs is the
   * separate, unrestricted count. Labor hours and its own completeness
   * are tracked independently, since billable_labor_hours can be
   * missing on jobs that DO have cost data and vice versa — the two are
   * genuinely independent completeness questions, not the same one
   * asked twice.
   */
  async getTechnicianPerformanceDetail(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      WITH job_costs AS (
        SELECT
          jli.job_id,
          SUM(jli.total) AS revenue,
          SUM(COALESCE(jli.actual_labor_hours, 0) *
              COALESCE((SELECT hourly_labor_rate FROM users WHERE id = jli.assigned_user_id), (SELECT default_labor_rate FROM companies WHERE id = ${companyId}::uuid), 0)
          ) AS labor_cost,
          SUM(COALESCE(jli.actual_chemical_cost, 0)) AS chemical_cost,
          SUM(COALESCE(jli.actual_equipment_cost, 0)) AS equipment_cost,
          SUM(COALESCE(jli.actual_fuel_cost, 0)) AS fuel_cost,
          SUM(COALESCE(jli.actual_misc_cost, 0)) AS misc_cost,
          BOOL_OR(jli.actual_labor_hours IS NOT NULL OR jli.actual_chemical_cost IS NOT NULL OR jli.actual_equipment_cost IS NOT NULL
                  OR jli.actual_fuel_cost IS NOT NULL OR jli.actual_misc_cost IS NOT NULL) AS has_actual_cost_data
        FROM job_line_items jli
        WHERE jli.company_id = ${companyId}::uuid
        GROUP BY jli.job_id
      ),
      eligible_jobs AS (
        SELECT
          j.id, j.assigned_user_id,
          jc.revenue, (COALESCE(jc.labor_cost,0)+COALESCE(jc.chemical_cost,0)+COALESCE(jc.equipment_cost,0)+COALESCE(jc.fuel_cost,0)+COALESCE(jc.misc_cost,0)) AS actual_cost,
          COALESCE(jc.has_actual_cost_data, false) AS has_actual_cost_data,
          j.billable_labor_hours
        FROM jobs j
        LEFT JOIN job_costs jc ON jc.job_id = j.id
        WHERE j.company_id = ${companyId}::uuid AND j.status = 'completed'
          AND j.actual_end >= ${start} AND j.actual_end < ${end} AND j.assigned_user_id IS NOT NULL
      ),
      callback_counts AS (
        -- Same definition getCallbackRate() already uses (distinct
        -- original_job_id from job_callbacks, joined against completed
        -- jobs in range) — applied at technician grain here, not
        -- redefined. Not a modification of the shared method; a
        -- grouped variant of the same formula, same precedent as
        -- getRevenueByTechnician vs. getRevenueTrend.
        SELECT ej.assigned_user_id, COUNT(DISTINCT jc.original_job_id) AS callback_jobs
        FROM eligible_jobs ej
        JOIN job_callbacks jc ON jc.original_job_id = ej.id AND jc.company_id = ${companyId}::uuid
        GROUP BY ej.assigned_user_id
      )
      SELECT
        u.id AS "technicianId", u.first_name AS "firstName", u.last_name AS "lastName",
        COUNT(ej.id) AS "totalJobs",
        COUNT(ej.id) FILTER (WHERE ej.has_actual_cost_data) AS "jobsWithCostData",
        COUNT(ej.id) FILTER (WHERE ej.billable_labor_hours IS NOT NULL) AS "jobsWithLaborData",
        COALESCE(SUM(ej.revenue) FILTER (WHERE ej.has_actual_cost_data), 0) AS "revenue",
        COALESCE(SUM(ej.actual_cost) FILTER (WHERE ej.has_actual_cost_data), 0) AS "actualCost",
        COALESCE(SUM(ej.revenue - ej.actual_cost) FILTER (WHERE ej.has_actual_cost_data), 0) AS "grossProfit",
        CASE WHEN COALESCE(SUM(ej.revenue) FILTER (WHERE ej.has_actual_cost_data), 0) > 0
          THEN ROUND(COALESCE(SUM(ej.revenue - ej.actual_cost) FILTER (WHERE ej.has_actual_cost_data), 0) / SUM(ej.revenue) FILTER (WHERE ej.has_actual_cost_data) * 100, 2)
          ELSE NULL END AS "grossMarginPercent",
        CASE WHEN COUNT(ej.id) FILTER (WHERE ej.has_actual_cost_data) > 0
          THEN ROUND(COALESCE(SUM(ej.revenue) FILTER (WHERE ej.has_actual_cost_data), 0) / COUNT(ej.id) FILTER (WHERE ej.has_actual_cost_data), 2)
          ELSE NULL END AS "averageTicket",
        COALESCE(SUM(ej.billable_labor_hours) FILTER (WHERE ej.billable_labor_hours IS NOT NULL), 0) AS "laborHours",
        CASE WHEN COALESCE(SUM(ej.billable_labor_hours) FILTER (WHERE ej.billable_labor_hours IS NOT NULL), 0) > 0
          THEN ROUND(COALESCE(SUM(ej.revenue) FILTER (WHERE ej.has_actual_cost_data AND ej.billable_labor_hours IS NOT NULL), 0)
                     / SUM(ej.billable_labor_hours) FILTER (WHERE ej.has_actual_cost_data AND ej.billable_labor_hours IS NOT NULL), 2)
          ELSE NULL END AS "revenuePerLaborHour",
        COALESCE(cc.callback_jobs, 0) AS "callbackJobs",
        CASE WHEN COUNT(ej.id) > 0 THEN ROUND(COALESCE(cc.callback_jobs, 0)::numeric / COUNT(ej.id) * 100, 2) ELSE NULL END AS "callbackRatePercent"
      FROM eligible_jobs ej
      JOIN users u ON u.id = ej.assigned_user_id
      LEFT JOIN callback_counts cc ON cc.assigned_user_id = ej.assigned_user_id
      GROUP BY u.id, u.first_name, u.last_name, cc.callback_jobs
      ORDER BY "grossProfit" DESC NULLS LAST
    `);
  }

  /** Drill-down: the jobs behind one technician's summary row, same reconciliation guarantee as Service Profitability's drilldown (identical CTE, identical filters). */
  async getTechnicianPerformanceDrilldown(companyId: string, start: Date, end: Date, technicianId: string) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      WITH job_costs AS (
        SELECT
          jli.job_id,
          SUM(jli.total) AS revenue,
          SUM(COALESCE(jli.actual_labor_hours, 0) *
              COALESCE((SELECT hourly_labor_rate FROM users WHERE id = jli.assigned_user_id), (SELECT default_labor_rate FROM companies WHERE id = ${companyId}::uuid), 0)
          ) AS labor_cost,
          SUM(COALESCE(jli.actual_chemical_cost, 0)) AS chemical_cost,
          SUM(COALESCE(jli.actual_equipment_cost, 0)) AS equipment_cost,
          SUM(COALESCE(jli.actual_fuel_cost, 0)) AS fuel_cost,
          SUM(COALESCE(jli.actual_misc_cost, 0)) AS misc_cost,
          BOOL_OR(jli.actual_labor_hours IS NOT NULL OR jli.actual_chemical_cost IS NOT NULL OR jli.actual_equipment_cost IS NOT NULL
                  OR jli.actual_fuel_cost IS NOT NULL OR jli.actual_misc_cost IS NOT NULL) AS has_actual_cost_data
        FROM job_line_items jli
        WHERE jli.company_id = ${companyId}::uuid
        GROUP BY jli.job_id
      )
      SELECT
        j.id AS "jobId", j.job_number AS "jobNumber",
        COALESCE(c.business_name, c.first_name || ' ' || c.last_name) AS "customerName",
        COALESCE(j.service_type, 'Other') AS "serviceName",
        j.actual_end AS "completedAt", j.actual_start AS "actualStart",
        j.billable_labor_hours AS "laborHours",
        COALESCE(jc.revenue, 0) AS revenue,
        (COALESCE(jc.labor_cost,0)+COALESCE(jc.chemical_cost,0)+COALESCE(jc.equipment_cost,0)+COALESCE(jc.fuel_cost,0)+COALESCE(jc.misc_cost,0)) AS "actualCost",
        CASE WHEN COALESCE(jc.has_actual_cost_data, false)
          THEN COALESCE(jc.revenue,0) - (COALESCE(jc.labor_cost,0)+COALESCE(jc.chemical_cost,0)+COALESCE(jc.equipment_cost,0)+COALESCE(jc.fuel_cost,0)+COALESCE(jc.misc_cost,0))
          ELSE NULL END AS "grossProfit",
        CASE WHEN COALESCE(jc.has_actual_cost_data, false) AND COALESCE(jc.revenue,0) > 0
          THEN ROUND((COALESCE(jc.revenue,0) - (COALESCE(jc.labor_cost,0)+COALESCE(jc.chemical_cost,0)+COALESCE(jc.equipment_cost,0)+COALESCE(jc.fuel_cost,0)+COALESCE(jc.misc_cost,0))) / jc.revenue * 100, 2)
          ELSE NULL END AS "grossMarginPercent",
        COALESCE(jc.has_actual_cost_data, false) AS "hasActualCostData",
        (SELECT COUNT(*) FROM job_callbacks jcb WHERE jcb.original_job_id = j.id AND jcb.company_id = ${companyId}::uuid) > 0 AS "hadCallback"
      FROM jobs j
      LEFT JOIN job_costs jc ON jc.job_id = j.id
      JOIN customers c ON c.id = j.customer_id AND c.company_id = ${companyId}::uuid
      WHERE j.company_id = ${companyId}::uuid AND j.status = 'completed' AND j.assigned_user_id = ${technicianId}::uuid
        AND j.actual_end >= ${start} AND j.actual_end < ${end}
      ORDER BY j.actual_end DESC
    `);
  }

  // =========================================================================
  // Route & Job Efficiency. Deliberately conservative — see the class-level
  // comment above and this method's own inline notes for exactly which
  // metrics are real vs. genuinely unavailable in this schema today.
  // Travel time, mileage, and reschedule tracking are NOT computed anywhere
  // in this method — confirmed absent from the schema (no travel_start/
  // travel_end/mileage columns, no generic reschedule-event table), not
  // silently approximated from GPS coordinates or calendar gaps.
  // =========================================================================

  async getRouteEfficiencySummary(companyId: string, start: Date, end: Date) {
    const rows: any[] = await this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      WITH job_costs AS (
        SELECT jli.job_id, SUM(jli.total) AS revenue
        FROM job_line_items jli WHERE jli.company_id = ${companyId}::uuid GROUP BY jli.job_id
      )
      SELECT
        COUNT(*) FILTER (WHERE j.status = 'completed') AS "completedJobs",
        COUNT(*) FILTER (WHERE j.status = 'cancelled') AS "cancelledJobs",
        COUNT(*) FILTER (WHERE j.status IN ('completed', 'cancelled')) AS "totalEligibleJobs",
        COUNT(*) FILTER (WHERE j.status = 'completed' AND j.actual_start IS NOT NULL AND j.actual_end IS NOT NULL) AS "jobsWithActualDuration",
        COUNT(*) FILTER (WHERE j.status = 'completed' AND j.scheduled_start IS NOT NULL AND j.scheduled_end IS NOT NULL) AS "jobsWithScheduledDuration",
        COUNT(*) FILTER (WHERE j.status = 'completed' AND j.actual_start IS NOT NULL AND j.actual_end IS NOT NULL AND j.scheduled_start IS NOT NULL AND j.scheduled_end IS NOT NULL) AS "jobsWithBothDurations",
        COUNT(*) FILTER (WHERE j.status = 'completed' AND j.actual_start IS NOT NULL AND j.scheduled_start IS NOT NULL) AS "jobsWithStartComparison",
        COUNT(*) FILTER (WHERE j.status = 'completed' AND j.actual_start IS NOT NULL AND j.scheduled_start IS NOT NULL AND j.actual_start > j.scheduled_start) AS "lateStartJobs",
        COALESCE(AVG(EXTRACT(EPOCH FROM (j.actual_end - j.actual_start)) / 60) FILTER (WHERE j.status = 'completed' AND j.actual_start IS NOT NULL AND j.actual_end IS NOT NULL), 0) AS "averageActualDurationMinutes",
        COALESCE(AVG(EXTRACT(EPOCH FROM (j.scheduled_end - j.scheduled_start)) / 60) FILTER (WHERE j.status = 'completed' AND j.scheduled_start IS NOT NULL AND j.scheduled_end IS NOT NULL), 0) AS "averageScheduledDurationMinutes",
        COALESCE(AVG(EXTRACT(EPOCH FROM ((j.actual_end - j.actual_start) - (j.scheduled_end - j.scheduled_start))) / 60)
          FILTER (WHERE j.status = 'completed' AND j.actual_start IS NOT NULL AND j.actual_end IS NOT NULL AND j.scheduled_start IS NOT NULL AND j.scheduled_end IS NOT NULL), 0) AS "averageScheduleVarianceMinutes",
        COALESCE(SUM(j.billable_labor_hours) FILTER (WHERE j.status = 'completed'), 0) AS "totalLaborHours",
        COALESCE(SUM(jc.revenue) FILTER (WHERE j.status = 'completed'), 0) AS "totalRevenue"
      FROM jobs j
      LEFT JOIN job_costs jc ON jc.job_id = j.id
      WHERE j.company_id = ${companyId}::uuid
        AND COALESCE(j.actual_end, j.scheduled_start, j.created_at) >= ${start} AND COALESCE(j.actual_end, j.scheduled_start, j.created_at) < ${end}
    `);
    const r = rows[0] ?? {};
    const completedJobs = Number(r.completedJobs ?? 0);
    const cancelledJobs = Number(r.cancelledJobs ?? 0);
    const totalEligible = Number(r.totalEligibleJobs ?? 0);
    const jobsWithBothDurations = Number(r.jobsWithBothDurations ?? 0);
    const jobsWithStartComparison = Number(r.jobsWithStartComparison ?? 0);
    const laborHours = Number(r.totalLaborHours ?? 0);
    const calendarDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));

    return {
      completedJobs,
      cancelledJobs,
      cancellationRatePercent: totalEligible > 0 ? Math.round((cancelledJobs / totalEligible) * 10000) / 100 : null,
      jobsWithActualDuration: Number(r.jobsWithActualDuration ?? 0),
      jobsWithScheduledDuration: Number(r.jobsWithScheduledDuration ?? 0),
      averageActualDurationMinutes: Number(r.jobsWithActualDuration ?? 0) > 0 ? Math.round(Number(r.averageActualDurationMinutes ?? 0)) : null,
      averageScheduledDurationMinutes: Number(r.jobsWithScheduledDuration ?? 0) > 0 ? Math.round(Number(r.averageScheduledDurationMinutes ?? 0)) : null,
      // Only meaningful when BOTH durations exist for the same job — a
      // job missing either side is excluded from this average entirely,
      // never treated as zero variance.
      averageScheduleVarianceMinutes: jobsWithBothDurations > 0 ? Math.round(Number(r.averageScheduleVarianceMinutes ?? 0)) : null,
      jobsWithBothDurations,
      // Late Job = actual_start later than scheduled_start — exact
      // comparison, no invented 15/30-minute grace threshold, per this
      // report's explicit instruction not to fabricate one.
      lateStartJobs: Number(r.lateStartJobs ?? 0),
      lateStartRatePercent: jobsWithStartComparison > 0 ? Math.round((Number(r.lateStartJobs ?? 0) / jobsWithStartComparison) * 10000) / 100 : null,
      jobsWithStartComparison,
      totalLaborHours: laborHours,
      // Revenue here is the full completed-job revenue for the period
      // (not restricted to cost-data-complete jobs the way Gross
      // Profit is elsewhere) — Revenue/Labor Hour only needs revenue
      // and hours, neither of which depends on actual-cost completeness.
      revenuePerLaborHour: laborHours > 0 ? Math.round((Number(r.totalRevenue ?? 0) / laborHours) * 100) / 100 : null,
      // Calendar days, not "working days" — Renovo has no stored
      // business-hours/working-day model to divide by instead, per
      // this report's own explicit fallback instruction.
      jobsPerCalendarDay: Math.round((completedJobs / calendarDays) * 100) / 100,
    };
  }

  /** Daily breakdown table for the Route & Job Efficiency page. Same duration/variance logic as the summary above, just grouped by day instead of aggregated for the whole period. */
  async getRouteEfficiencyByDay(companyId: string, start: Date, end: Date) {
    return this.prisma.withTenantContext(companyId, (tx) => tx.$queryRaw`
      WITH job_costs AS (
        SELECT jli.job_id, SUM(jli.total) AS revenue
        FROM job_line_items jli WHERE jli.company_id = ${companyId}::uuid GROUP BY jli.job_id
      )
      SELECT
        date_trunc('day', j.actual_end)::date AS "date",
        COUNT(*) AS "jobs",
        COALESCE(SUM(jc.revenue), 0) AS "revenue",
        COALESCE(SUM(j.billable_labor_hours) FILTER (WHERE j.billable_labor_hours IS NOT NULL), 0) AS "laborHours",
        CASE WHEN COUNT(*) FILTER (WHERE j.actual_start IS NOT NULL AND j.actual_end IS NOT NULL) > 0
          THEN ROUND(AVG(EXTRACT(EPOCH FROM (j.actual_end - j.actual_start)) / 60) FILTER (WHERE j.actual_start IS NOT NULL AND j.actual_end IS NOT NULL))
          ELSE NULL END AS "averageDurationMinutes",
        CASE WHEN COUNT(*) FILTER (WHERE j.actual_start IS NOT NULL AND j.actual_end IS NOT NULL AND j.scheduled_start IS NOT NULL AND j.scheduled_end IS NOT NULL) > 0
          THEN ROUND(AVG(EXTRACT(EPOCH FROM ((j.actual_end - j.actual_start) - (j.scheduled_end - j.scheduled_start))) / 60)
                     FILTER (WHERE j.actual_start IS NOT NULL AND j.actual_end IS NOT NULL AND j.scheduled_start IS NOT NULL AND j.scheduled_end IS NOT NULL))
          ELSE NULL END AS "scheduleVarianceMinutes"
      FROM jobs j
      LEFT JOIN job_costs jc ON jc.job_id = j.id
      WHERE j.company_id = ${companyId}::uuid AND j.status = 'completed' AND j.actual_end >= ${start} AND j.actual_end < ${end}
      GROUP BY 1 ORDER BY 1 ASC
    `);
  }
}
