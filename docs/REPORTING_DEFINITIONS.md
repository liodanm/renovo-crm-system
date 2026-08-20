# REPORTING_DEFINITIONS.md

Authoritative definitions for financial/reporting terms used across
Renovo's backend and frontend. Referenced by code comments in
`schema.prisma` and `reports.service.ts`. Updated by the reporting
verification gate's final decision round — Average Ticket and Revenue
were both corrected here, not silently changed in code alone.

---

## Revenue terminology — four distinct tiers, never interchangeable

| Term | Definition | Source | Date basis |
|---|---|---|---|
| **Estimate Value** | Value represented by estimates, any status | `SUM(estimates.total_amount)` | `estimates.created_at` |
| **Accepted Estimate Value** | Value represented by *accepted* estimates only | `SUM(estimates.total_amount) WHERE status='accepted'` | `estimates.created_at` (the estimate's creation date, not its acceptance date — see the open question below) |
| **Invoiced Revenue** | Total invoice amount issued, regardless of payment status | `SUM(invoices.total_amount) WHERE status != 'void'` | `invoices.created_at` |
| **Collected Revenue** | Money actually, successfully collected | `SUM(payments.amount) WHERE status='succeeded'` | `COALESCE(payments.payment_date, payments.processed_at)` |

**The Owner Scorecard's primary "Revenue" KPI is Collected Revenue** —
this was a real, confirmed defect before this fix: it previously summed
`getRevenueTrend()` (Invoiced Revenue) while labeled simply "Revenue,"
with no distinction that unpaid invoices were included in that number.
Fixed by reusing the already-existing, already-correct
`getPaymentTrend()` — the exact query that already implemented the
Collected Revenue definition, just never surfaced on the Scorecard. No
new backend calculation was needed for this fix; `getRevenueTrend()`
(Invoiced Revenue) remains available, untouched, in `/reports/all` for
anyone who specifically wants that number.

**Open question, not resolved by this pass:** "Accepted Estimate Value"
above uses `estimates.created_at` as its date basis (matching
`getPeriodKpis()`'s existing WHERE clause), not `estimates.accepted_at`
— meaning an estimate created in July but accepted in August currently
counts toward July's "Accepted Estimate Value," not August's. This is
inherited, pre-existing behavior, not something this pass changed;
flagged here since a future dedicated Estimate Conversion report page
will need to make a deliberate choice about which date basis is
correct for that specific report, rather than silently inheriting this
one.

---

## Average Ticket vs. Average Accepted Estimate — corrected, not merely renamed

**Average Ticket = Completed Job Revenue ÷ Completed Jobs.**
Source: `AVG(jobs.price) WHERE status='completed'`. Date basis:
`jobs.actual_end`.

`jobs.price` (not `SUM(job_line_items.total)`) is the deliberate choice
here: it's set once, at job creation, directly from the originating
estimate's post-tax total (`JobsService.createFromEstimate`), and never
modified afterward since job line items are write-once in this
architecture. It represents the real dollar value a completed job is
worth — the figure that eventually gets invoiced.

**This is a materially different number from Job Cost & Gross Margin's
own "revenue"** (`SUM(job_line_items.total)`, a pre-tax subtotal used
in `getJobCostDetail()`), which remains unchanged, per the explicit
instruction not to alter that calculation. The two are allowed to
differ in basis — documenting that difference explicitly here is the
fix for what would otherwise be a silent inconsistency between two
"job revenue" numbers living in the same reporting system.

**Average Accepted Estimate = Accepted Estimate Value ÷ Accepted
Estimates.** This is the calculation "Average Ticket" incorrectly held
before this fix — preserved, not deleted, under its own honest name
(`averageAcceptedEstimateValue` in `getPeriodKpis()`'s response). Real
and useful (it answers "how big is a typical deal we win"), just never
"Average Ticket." No dedicated UI card surfaces it yet — it's available
in the API response for whenever an Estimate Conversion detail page is
built.

---

## Gross Profit / Gross Margin (actual, not estimated)

Unchanged by this pass, per explicit instruction. `Actual Cost =
laborCost + chemicalCost + equipmentCost + fuelCost + miscCost`, where
`laborCost = actualLaborHours x resolveLaborRate(...)`. `Gross Profit =
Revenue - Actual Cost` (revenue here = `SUM(job_line_items.total)`, the
pre-tax subtotal - see the Average Ticket section above for why this
differs from that metric's own revenue basis). `Gross Margin % = Gross
Profit / Revenue x 100`. Date basis: `jobs.actual_end`. A job with zero
actual-cost records is excluded from the aggregate entirely, never
shown as $0 cost / 100% margin.

**Verified worked example** (hand-computed against the real SQL
expressions, and covered by `job-profit.util.spec.ts`'s equivalent
formula-structure test - a live-database execution test of this exact
SQL remains blocked by this sandbox having no Postgres instance):
Revenue $500, Labor $85, Chemicals $35, Fuel $18, Misc $10 -> Actual
Cost $148, Gross Profit $352, Gross Margin 70.4%.

---

## Estimate Conversion Rate

= Accepted Estimates / Eligible Estimates (sent, viewed, accepted,
declined, expired - a draft never sent is not eligible). Date basis:
`estimates.created_at`, for estimates *created* in the selected period.

## Callback Rate

= Callback Jobs / Completed Jobs, both counted over the same date
range, both company-scoped. "Callback Jobs" = distinct
`job_callbacks.original_job_id` values where the original job is
`status = 'completed'` within the range. Date basis: `jobs.actual_end`
(the original job's completion date - not the callback's own
`created_at`).

## Comparison periods - calendar-based, not duration-based

Fixed by this reporting phase after a confirmed bug (see
`resolveComparisonPeriod` in `frontend/lib/api/reports.ts`, and
`reports.test.ts` for the automated regression coverage). Every named
preset shifts back by exactly one calendar unit (day/week/month/quarter
/year), preserving the same relative cutoff within that unit - never a
generic "same elapsed duration" shift, which produces the wrong window
for any partial period. Custom ranges are the one legitimate exception:
with no calendar unit to anchor to, a trailing window of the same
duration immediately preceding the range is the only defensible
default.

**Verified example:** "This Month" on Aug 19 (Aug 1-19) compares
against **Jul 1-19** - not Jul 14-Aug 1, which was the confirmed bug.

## Data completeness banners

("X of Y jobs have cost data") must always distinguish *no data
recorded* (excluded from the aggregate entirely) from *complete data*
(every line item on the job has at least one actual-cost field) from
*partial data* (some but not all line items do) - never collapse these
into a single true/false. Unchanged by this pass; verified correct in
the prior verification gate.

## Recurring Revenue

**Not yet available.** Renovo has no active recurring-service/
subscription data model - there is genuinely nothing to calculate.
Displayed as "Not yet available" on the Owner Scorecard, never a
fabricated $0. A missing data source must never silently become a
financial zero anywhere in this reporting system - this is the
governing rule the whole "Not yet available" pattern exists to enforce,
and it applies to every KPI, not just this one.
