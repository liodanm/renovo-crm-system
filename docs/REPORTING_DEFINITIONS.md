# REPORTING_DEFINITIONS.md

Authoritative definitions for financial/reporting terms used across
Renovo's backend and frontend. Referenced by code comments in
`schema.prisma` and `reports.service.ts` — this file existing is itself
a fix for a real gap found during the reporting verification gate: those
comments pointed here before this file existed.

**Revenue has four distinct tiers — never conflate them:**
- **Quoted:** `SUM(estimates.total_amount)`, filtered by status.
- **Scheduled:** `SUM(jobs.price)` for scheduled/in-progress jobs.
- **Invoiced:** `SUM(invoices.total_amount)`, `status != 'void'`. This is
  what the Owner Scorecard's "Revenue" KPI and `getRevenueTrend()`
  currently show — money billed, not money collected. Worth a clearer
  label in the UI; not yet renamed as of this document's creation.
- **Collected:** `SUM(payments.amount)`, `status = 'succeeded'`, or the
  maintained `customers.lifetime_value` column at the per-customer level.

**Customer Lifetime Value = Collected revenue**, net of refunds/voids —
not invoice totals. `customers.lifetime_value` is the authoritative,
automatically-maintained source (see `payments.service.ts`'s three
increment/decrement call sites). `getCustomerAnalytics()` in
`reports.service.ts` was fixed during the reporting-foundation phase to
use this column after a prior version disagreed with it.

**Gross Profit / Gross Margin (actual, not estimated):**
`Actual Cost = laborCost + chemicalCost + equipmentCost + fuelCost +
miscCost`, where `laborCost = actualLaborHours × resolveLaborRate(...)`.
`Gross Profit = Revenue − Actual Cost`. `Gross Margin % = Gross Profit /
Revenue × 100`. A job with zero actual-cost records is never shown as
$0 cost / 100% margin — it's excluded from the actual-margin aggregate
entirely (see `getJobCostDetail()`'s `has_actual_cost_data` filter).
Reference worked example (also the exact case
`job-profit.util.spec.ts` tests): Revenue $500, Labor $85, Chemicals
$35, Fuel $18, Misc $10 → Actual Cost $148, Gross Profit $352, Gross
Margin 70.4%.

**Estimate Conversion Rate** = Accepted Estimates ÷ Eligible Estimates
(sent, viewed, accepted, declined, expired — drafts never sent are not
eligible), for estimates *created* in the selected period.

**Average Ticket — currently a known discrepancy, not yet fixed.**
`getPeriodKpis()`'s `averageTicket` field is `AVG(estimates.total_amount)
WHERE status = 'accepted'` — the average **accepted estimate value**,
not completed-job or invoice revenue. This does not match the
"Completed Job Revenue ÷ Completed Jobs" definition used elsewhere in
this project's own planning documents. Flagged during the reporting
verification gate; left unchanged pending a product decision on which
definition the Owner Scorecard should actually show, per that gate's
"do not refactor working SQL without a confirmed defect + explicit
decision" instruction — this is a labeling/definition question, not a
broken calculation.

**Callback Rate** = Callback Jobs ÷ Completed Jobs, both counted over
the same date range, both company-scoped. "Callback Jobs" = distinct
`job_callbacks.original_job_id` values where the original job is
`status = 'completed'` within the range — a job called back twice still
counts once. See `JobCallbacksService.getCallbackRate()`.

**Data completeness banners** ("X of Y jobs have cost data") must always
distinguish *no data recorded* (excluded from the aggregate entirely)
from *complete data* (every line item on the job has at least one
actual-cost field) from *partial data* (some but not all line items do)
— never collapse these into a single true/false.
