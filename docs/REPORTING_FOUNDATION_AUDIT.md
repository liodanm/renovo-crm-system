# RENOVO — REPORTING DATA FOUNDATION & KPI INSTRUMENTATION AUDIT

**Status:** Phase A (Audit) and Phase B (Gap Analysis) complete. Phase C
(schema changes) is **proposed, not implemented** — see the end of this
document. No migrations, no code changes, no data touched. Traced
directly against `backend/prisma/schema.prisma` and the real service
code at commit `f274921` (2026-08-18).

**Headline finding, so it isn't buried:** Renovo's data model for this
is materially more built-out than a typical CRM at this stage — full
ID-based Lead→Customer→Estimate→Job→Invoice→Payment lineage, a
maintained `Customer.lifetimeValue` running total, and **a `reports/`
module that already implements real portions of 5 of the 12 target
reports** (Lead Source Performance, a version of CLV/repeat, Technician
Performance, Chemical/Equipment usage-by-volume, and AR Aging). The real
gaps are narrower and more specific than "reporting doesn't exist yet" —
they cluster around **job-level actual cost** (as opposed to
estimate-time projected cost), **chemical/equipment unit costs**, and
two genuinely-missing concepts (**callback/rework tracking**,
**recurring service management**). Everything else is a query-layer
exercise against data that's already reliably captured.

---

## PHASE A — AUDIT

### Existing end-to-end lineage (verified via source, not inferred)

```
Lead (public capture, no separate entity)
  → Customer (customer_id, source, lead_status)
    → Estimate (customer_id, property_id FKs)
      → Job (estimate_id FK — real, not name-matched)
        → Invoice (job_id FK AND estimate_id FK — both preserved)
          → Payment (invoice_id FK, nullable for no-invoice payments;
                      customer_id always required)
```

Every arrow above is a real foreign key, confirmed directly in
`schema.prisma`. **No text/name matching is used anywhere in this
chain** — the audit brief's Section 6 requirement is already met.

### Existing timestamp/event coverage, model by model

**Customer:** `createdAt` ✅. No `firstServiceAt`/`lastServiceAt` columns
— but derivable via `MIN`/`MAX(jobs.actual_end WHERE status='completed')`
per customer. `reviewReceivedAt` exists (manual, honestly documented as
manual in its own code comment — no Google Business Profile integration
exists to automate it).

**Estimate:** `createdAt`, `sentAt`, `viewedAt`, `acceptedAt`,
`declinedAt` (+`declineReason`/`declineComments`), `acceptedVia`,
`acceptedByUserId` — all present. **No `expiredAt` column** — `status`
includes `'expired'` as a value but the timestamp of that transition
isn't separately stored; must be derived from `validUntil` once the
automation engine (which does mark estimates expired, per
`automation.service.ts`'s `estimate_expired` rule type) flips status.
Workable via `AutomationLog` (`ruleType='estimate_expired'`,
`sentAt`) as the event record, but not as clean as a dedicated column.

**Job:** `createdAt`, `scheduledStart`, `scheduledEnd`, `actualStart`,
`actualEnd`, `cancellationReason` all present. **No dedicated
`completedAt` column** — "when did this job complete" must be derived
from `JobStatusHistory WHERE toStatus='completed'`, taking `changedAt`.
This is a real, reliable source (not a gap requiring a new field, per
the instruction not to create redundant timestamps) but it means every
completion-time query needs a join, not a flat column read.

**Invoice:** `createdAt`, `sentAt`, `viewedAt`, `paidAt`, `dueDate`,
`balanceDue` (generated column) — all present and complete.

**Payment:** `createdAt`, `processedAt`, `paymentDate`, `status`
(includes at minimum `succeeded`, `pending`, `partially_refunded`, and
presumably `failed`/`refunded`/`voided` based on the void/refund code
paths) — complete.

### Lead source tracking — real but not fully closed

A controlled, per-company-configurable lead source list already exists:
`Settings → Lead Sources`, backed by `companies.settings.leadSources`
(23 default entries — Google, Client Referral, Yard Sign, Facebook,
Instagram, YouTube, Nextdoor, Yelp, Vehicle Sign, Door Hanger, Website,
Personal, Networking Event, Repeat Customer, Angi, plus several disabled
by default). The Customer creation form's Source field is a `<select>`
populated from this list — the *intended* path is already
controlled-vocabulary.

**The gap:** `Customer.source` in the database is a plain `String?` with
**no server-side validation** (`create-customer.dto.ts` declares
`source?: string`, no `@IsIn()` or equivalent). Any API caller bypassing
the form's dropdown — CSV import, a future integration, direct API
access — can write an arbitrary string. This is a narrow, precisely
-scoped gap: the vocabulary exists, it just isn't enforced everywhere
data can enter.

**Preserving source through the lifecycle:** confirmed correct —
`Customer.source` is set once at customer creation and never overwritten
by any later estimate/job/invoice/payment code path (verified — no
write to `customers.source` outside customer creation/import/merge).

### Revenue distinctions (Quoted / Scheduled / Invoiced / Collected)

All four are genuinely distinguishable today, each from a different
existing field, **but nothing currently prevents them from being
casually conflated** — and one real instance of exactly that conflation
already exists in shipped code (see next section). No new storage is
needed here; this is purely a query-discipline concern.

| Revenue type | Correct source |
|---|---|
| Quoted | `SUM(estimates.total_amount)`, filtered by status |
| Scheduled | `SUM(jobs.price)` for scheduled/in-progress jobs |
| Invoiced | `SUM(invoices.total_amount)`, `status != 'void'` |
| Collected | `SUM(payments.amount)`, `status = 'succeeded'`, or the maintained `customers.lifetime_value` column |

### ⚠️ Confirmed, already-flagged inconsistency in existing reports code

`reports.service.ts` contains **two different methods computing
"lifetime value" two different ways**, and one of them contains its own
code comment acknowledging this:

- `getCustomerAnalytics()`: `SUM(invoices.total_amount)` per customer —
  this is **Invoiced Revenue**, not money actually collected.
- `getLeadSourceAnalytics()`: reads `customers.lifetime_value` directly
  — this is the maintained, **payments-based** running total, i.e.
  genuinely **Collected Revenue**.

The second method's own comment states this was found and deliberately
not copied: *"a real, pre-existing inconsistency found during this
feature's audit, flagged rather than silently copied."* That flag was
correct but the first method was never fixed to match — **it still
exists, unfixed, in current source.** This is a live, real instance of
exactly the Section 7 risk the audit brief warned about, not a
hypothetical.

### Job-level financial data — the biggest real gap in this audit

`EstimateLineItem` has genuine cost/profit infrastructure:
`estimatedLaborHours`, `estimatedChemicalCost`, `estimatedEquipmentCost`,
`estimatedFuelCost`, `estimatedMiscCost`, `estimatedProfit`,
`profitMarginPercent`, `assignedUserId` — all real, all populated
(`estimate-profit.util.ts`, with a clean `resolveLaborRate()` helper
that already handles the company-default-vs-employee-override
resolution order correctly).

**`JobLineItem` has none of this.** No cost fields, no `estimatedProfit`,
no `assignedUserId`, nothing. Confirmed directly — the model literally
has no columns for it.

**The practical consequence:** the one "profit" figure currently shown
anywhere in the app (`getMonthlyProfitTrend` in `reports.service.ts`) is
computed from `estimate_line_items.estimated_profit` at
**estimate-acceptance time** — it does not reflect anything that changed
between acceptance and job completion (extra chemicals used, added line
items, actual hours worked vs. estimated). This is honestly labeled
"estimated" in the code's own comments, not misrepresented — but it
means **Report #6 (Job Cost & Gross Margin) cannot currently be built
from real, actual, job-level cost data** — only from the frozen estimate
projection. This is the single most consequential gap in this whole
audit for the target report set.

### Chemical & Equipment usage — usage tracked, cost is not

`JobChemicalUsage`: `chemicalName`, `quantity`, `unit` — **no
cost-per-unit or total-cost field.** Confirmed directly in schema.
`getChemicalUsageSummary()` in the existing reports service already
handles this honestly: its own comment states costs are "never designed
to carry a per-unit price... reporting usage volume instead of
fabricating a cost number." This matches the audit brief's own explicit
example (SH used = 8 gallons, cost = $X/gallon) almost exactly — that
exact calculation is not currently possible with real data.

`JobEquipmentUsage`: `equipmentName`, `notes` only — no cost field, no
`equipmentType` field, no linkage to a rate/depreciation figure.

### Labor tracking

`Company.defaultLaborRate` and `User.hourlyLaborRate` (nullable
per-employee override) both exist and are already wired together via
`resolveLaborRate()`. `Job.calculatedLaborHours` and
`Job.billableLaborHours` exist (explicitly kept as two distinct numbers
per a migration-013 comment). **Gap:** only one `assignedUserId` per
job — no join table for multiple technicians on one job with individual
hours. The audit brief explicitly asks about "multiple technicians" —
this genuinely isn't supported today; a job has exactly one assignee.

### Service-level reporting

`ServiceCatalogItem` is the standardized catalog and every line-item
table (`EstimateLineItem`, `JobLineItem`, `InvoiceLineItem`) carries a
nullable `serviceCatalogItemId`. Real and usable — but line items can
still be created without a catalog reference (`serviceType='other'` +
`customServiceName`), so "which services generate the most revenue"
needs a `COALESCE(catalog_name, custom_service_name)` grouping in the
reporting layer, not a schema change.

### Customer Lifetime Value

`Customer.lifetimeValue` is a real, **automatically maintained** running
total — not manually editable by staff (no PATCH path found that writes
it directly). It's incremented/decremented from **three separate call
sites**: manual payment recording, the shared void/refund reversal path,
and the portal's Stripe webhook handler
(`portal.controller.ts:162`). All three were checked and each correctly
adjusts the total. This is a real, working pattern — but it's still a
maintained duplicate of `SUM(payments.amount)`, not a live calculation,
which carries genuine drift risk if a fourth payment-creation path is
ever added without remembering to update it too. Worth being aware of,
not necessarily worth ripping out (it works today and a live `SUM()` on
every customer list load has its own cost).

### Repeat customer detection

No stored flag exists — and none is needed. `jobs.status='completed'`
per customer, counted/ordered by `actual_end`, is a reliable, single
source of truth already used by `getCustomerAnalytics()`'s existing
`repeatCustomerCount` calculation. This report requirement is
essentially already met by existing code, confirmed by direct read.

### Recurring service / recurring revenue

**Does not exist as an active-subscription model.** `ServiceRequest` has
`isRecurring`/`recurringFrequency` fields, but this is a one-time
portal-submitted *request* record (`status: pending|reviewed|converted|
declined`) — it has no `nextServiceDate`, no `price`, no active/canceled
lifecycle, nothing that could answer "which customers are on a recurring
plan today." Per the audit brief's own instruction, this is documented
as a future data requirement, not built now — see Phase C notes below.

### Route & Job Efficiency

`Job.scheduledStart/End`, `actualStart/End`, and real GPS
(`startLatitude/Longitude`, `endLatitude/Longitude`) all exist —
schedule variance and on-site duration are both fully calculable today.
**No travel-time data exists** (distance/time between consecutive jobs)
— correctly left undocumented-as-existing rather than fabricated, per
the brief's explicit instruction.

### Callback / Rework tracking

**Does not exist at all.** No table, no flag on `Job`, no
`originalJobId` reference, nothing. This is the cleanest, most
clear-cut, lowest-risk genuine gap found in this entire audit — a new
small table is the correct fix, with no ambiguity about where it
belongs or whether something already covers it.

### Customer satisfaction

`Review` and `ReviewRequest` models already closely match what's
needed: `rating`, `reviewText`, `reviewDate`, `platform`, `customerId`,
`jobId`, `respondedAt`. **Minor gap:** no `technicianId`/crew reference
on `Review` (can't currently report "customer satisfaction by
technician"), and no stored complaint-indicator boolean (derivable from
`rating <= 2` at query time instead of storing a duplicate flag).

### Accounts Receivable

Already fully served by existing fields — `getReceivablesAging()`
already exists in `reports.service.ts` and correctly buckets by
`due_date` into Current/1-30/31-60/60+ (brief asked for a 90+ bucket
specifically; current code stops at "60Plus" — a one-line query
adjustment, not a schema gap).

### Tenant / SaaS isolation for reporting queries specifically

Every query in `reports.service.ts` inspected in this audit
(`getCustomerAnalytics`, `getTechnicianPerformance`,
`getChemicalUsageSummary`, `getEquipmentUsageSummary`,
`getReceivablesAging`, `getMonthlyProfitTrend`, `getLeadSourceAnalytics`,
`getLeadSourceTrend`) is called through
`this.prisma.withTenantContext(companyId, ...)` and every raw SQL
`WHERE` clause explicitly includes `company_id = ${companyId}::uuid` —
**both the RLS-backed session variable and an explicit application-level
filter, on every single reporting query checked.** No cross-tenant
leakage path was found in this module. This matches the pattern
confirmed correct in the prior reconciliation audit for every other
module.

### Audit/event logging infrastructure

Reusable infrastructure already exists and should be extended, not
duplicated: `JobStatusHistory` (status transitions with
timestamp+actor+GPS), `JobAuditLog` (generic before/after value
tracking), `AutomationLog` (every automated message sent, with
`ruleType` as the event-type discriminator), `ReviewRequest`
(review-request lifecycle). Estimates have no equivalent dedicated
history table, but don't need one — their timestamp columns
(`sentAt`/`viewedAt`/`acceptedAt`/`declinedAt`) already serve as a
complete-enough event record for a document with a short, linear
lifecycle.

---

## PHASE B — GAP ANALYSIS TABLE

| KPI / Report Need | Required Data | Existing? | Location | Gap | Action |
|---|---|---|---|---|---|
| Revenue by stage (Quoted/Scheduled/Invoiced/Collected) | 4 distinct sums | ✅ / ⚠️ | estimates/jobs/invoices/payments tables | Data exists; **one existing query (`getCustomerAnalytics`) already conflates Invoiced with "lifetime value"** | Query-layer fix only — no schema change |
| Estimate Conversion Rate | sent/accepted/declined/expired counts, timestamps | ✅ | `estimates` table | `expiredAt` not a dedicated column (derivable via `AutomationLog`) | Query-layer; optionally add `expiredAt` for a cleaner query (see Phase C) |
| Average Ticket | invoice/job totals | ✅ | `invoices`, `jobs` | None | Query-layer only |
| Lead Source Performance | source, conversion, revenue | 🟡 | `customers.source`, `settings.leadSources` | Controlled vocabulary exists but **not server-enforced** | Add `@IsIn()`-equivalent validation against the enabled source list |
| Service Profitability | revenue + cost per service | 🟡 | `EstimateLineItem` has costs; `JobLineItem` does not | Job-level (actual) cost fields missing | Add cost columns to `JobLineItem` — see Phase C |
| Job Cost & Gross Margin | actual job-level revenue − cost | 🔴 | N/A | **The core gap of this whole audit** — only estimate-time projected profit exists | Add job-level cost fields + a `jobs.actual_profit`/margin calc path |
| Customer Lifetime Value | total revenue/profit per customer | ✅ / ⚠️ | `customers.lifetime_value` (payments-based, maintained) | Duplicate-of-truth risk (3 write sites); no gross-profit LTV variant | No schema change; document the 3 write sites as a single reviewed unit |
| Crew/Technician Performance | jobs completed, hours, revenue per tech | ✅ / 🟡 | `jobs.assigned_user_id`, `job_status_history` | No multi-technician-per-job support | Document as a future data requirement; single-assignee model stands for now |
| Route & Job Efficiency | scheduled vs. actual time, GPS | ✅ / 🔴 | `jobs` (schedule+actual+GPS) exists; travel time does not | No inter-job travel-time data | Document as future requirement — do not fabricate |
| Customer Satisfaction & Callback | ratings + rework tracking | 🟡 / 🔴 | `Review`/`ReviewRequest` exist; callback tracking does not | No callback/rework table at all; no technician link on `Review` | Add a small `JobCallback` table (see Phase C); optionally add `Review.technicianId` |
| Repeat & Recurring Customer Performance | repeat detection + active recurring plans | ✅ / 🔴 | Repeat: derivable from `jobs`. Recurring: no active-subscription model | Recurring service management doesn't exist | Document data requirements only, per brief's explicit instruction — do not build billing |
| Accounts Receivable & Cash | aging buckets | ✅ | `invoices` (balance_due, due_date) | Existing query stops at "60+" instead of adding a 90+ split | Query-layer fix only |
| Chemical cost per job | usage × unit cost | 🔴 | `job_chemical_usage` (quantity/unit only) | No per-unit cost anywhere in the system | Add a company-scoped chemical cost list + `costPerUnit`/`totalCost` — see Phase C |
| Equipment cost per job | usage × operating cost | 🔴 | `job_equipment_usage` (name/notes only) | No cost or type field | Lower priority — document as future requirement |

---

## 12-REPORT READINESS MATRIX

| # | Report | Ready today? | Missing data | Notes |
|---|---|---|---|---|
| 1 | Revenue & Sales Performance | Mostly | None (schema) | Needs the 4-tier revenue distinction enforced at the query layer |
| 2 | Estimate Conversion | Yes | `expiredAt` (optional nicety) | Full lineage + timestamps already present |
| 3 | Average Ticket | Yes | None | — |
| 4 | Lead Source Performance | Mostly built already (`getLeadSourceAnalytics`) | Server-side source validation | Query logic already exists in `reports.service.ts` |
| 5 | Service Profitability | Partial | Job-level cost fields | Estimate-time cost exists; job-time does not |
| 6 | Job Cost & Gross Margin | **No** | Job-level cost fields (the core gap) | Only estimate-time projected profit exists today |
| 7 | Customer Lifetime Value | Mostly built already (partially, via `customers.lifetime_value`) | A gross-profit LTV variant, if wanted | Reconcile the two existing, disagreeing LTV calculations first |
| 8 | Crew/Technician Performance | Partial (already built for single-assignee case) | Multi-technician support | `getTechnicianPerformance` already exists and works for the current single-assignee model |
| 9 | Route & Job Efficiency | Partial | Inter-job travel time | Schedule variance and on-site duration are ready today |
| 10 | Customer Satisfaction & Callback | Partial | Callback/rework table (doesn't exist) | Satisfaction side is ready; callback side needs a new table |
| 11 | Repeat & Recurring Customer Performance | Partial | Active recurring-service model | Repeat detection is ready today; recurring is a documented future requirement |
| 12 | Accounts Receivable & Cash | Yes (already built — `getReceivablesAging`) | 90+ bucket split | Nearly complete already |

---

## PHASE C — PROPOSED MINIMAL SCHEMA CHANGES (NOT YET IMPLEMENTED)

Per the brief's own sequencing and this project's established workflow,
these are **proposals awaiting your approval**, not changes already
made. Each is additive-only, matches the existing schema's own
conventions, and is scoped to close a specific gap identified above —
nothing speculative.

1. **Add cost fields to `JobLineItem`**, mirroring `EstimateLineItem`'s
   existing shape (`estimatedLaborHours` → `actualLaborHours`,
   `estimatedChemicalCost` → `actualChemicalCost`, etc., plus
   `actualProfit`/`actualProfitMarginPercent`, and `assignedUserId` for
   consistency with the estimate side). This is the single highest-value
   change in this whole list — it's what makes Report #6 real.
2. **Add a company-scoped chemical cost reference** (a small new table,
   e.g. `chemical_cost_rates: companyId, chemicalName, unit,
   costPerUnit`) plus a `totalCost` column on `JobChemicalUsage`,
   computed at usage-record time from the rate in effect then (a
   snapshot, same pattern as every other financial field in this
   schema — never recalculated retroactively if the rate later
   changes).
3. **Add a `JobCallback` table**: `jobId`, `originalJobId` (nullable,
   for when the callback becomes its own job record), `customerId`,
   `reason`, `createdAt`, `resolution`, `additionalLaborCost`,
   `additionalMaterialCost`, `refundAmount` — matches the audit brief's
   Section 16 field list directly.
4. **Add `Estimate.expiredAt`** (nullable timestamp) — small, optional,
   removes the need to join through `AutomationLog` for a simple query.
5. **Add server-side validation** on `Customer.source` /
   `create-customer.dto.ts` against the company's enabled
   `leadSources` list — not a schema change, a validation-layer fix.
6. **Fix `getCustomerAnalytics()`** to use the same
   `customers.lifetime_value` column `getLeadSourceAnalytics()` already
   correctly uses, removing the live inconsistency — not a schema
   change, a one-method code fix.

**Explicitly not proposed, per the brief's own instructions:**
multi-technician-per-job support, recurring service/billing
infrastructure, equipment cost/type fields (lower value, more
speculative than the chemical-cost case), and travel-time tracking —
all documented above as real future requirements, none fabricated or
built prematurely.

---

## REQUIRED FINAL REPORT

**A. Files changed:** None. This phase performed audit and analysis
only, per your instruction and the brief's own phased sequencing.

**B. Database changes:** None. Six specific, additive changes are
proposed above, pending your approval before any migration is written.

**C. Existing data reused:** The full Lead→Customer→Estimate→Job→
Invoice→Payment ID-based lineage, all existing timestamp columns,
`Customer.lifetimeValue`'s maintained running total, the existing
`ServiceCatalogItem` standardization, `JobStatusHistory` as the source
of job-completion timing, and — most significantly — the substantial
portions of `reports.service.ts` that already implement real pieces of
5 of the 12 target reports.

**D. New data captured:** None yet — this phase captured no new data;
Phase C proposes exactly what would need to be captured going forward.

**E. 12-report readiness matrix:** See above.

**F. Data flow:** See the lineage diagram at the top of Phase A — fully
ID-based, no text-matching, verified directly in the Prisma schema's
foreign key relations.

**G. Security verification:** Every reporting query in
`reports.service.ts` was individually checked for
`withTenantContext` + explicit `company_id` filtering — confirmed
present on all 8 methods inspected. No cross-tenant leakage path found.
No live test was run (this phase made no changes to run against); a
live test can be built alongside Phase C/E once schema changes are
approved.

**H. Tests:** None executed in this phase — no code changed. Phase E
(Validation) work is scoped to run once Phase C is approved and
implemented.

**I. Remaining gaps:** Job-level actual cost (the core gap), chemical/
equipment unit costs, callback/rework tracking, multi-technician
support, recurring service management, inter-job travel time — all
detailed above with an honest readiness assessment per report, none
overstated as "done" and none fabricated as data that doesn't exist.

---

**Waiting for your decision on the 6 proposed Phase C changes before
any schema or code is touched.**
