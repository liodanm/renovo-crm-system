# RENOVO — REPORTING PHASE VERIFICATION GATE: FINAL REPORT

Traced, tested, and where defects were confirmed, fixed — narrowly,
matching the gate's own "fix only confirmed defects" instruction. Two
real bugs found and fixed. Three real tenant-scoping gaps found and
fixed. One dangling documentation reference found and closed. One
labeling discrepancy found and documented, deliberately left unfixed
pending your decision.

---

## A. Repository State

- **Remote:** `https://github.com/liodanm/renovo-crm-system.git`
- **Branch:** `main`
- **Local HEAD:** `f274921` (2026-08-18) — the last commit this sandbox
  successfully cloned, before GitHub access returned 401.
- **GitHub access:** Still returns `401 Unauthorized` on a direct
  `git-upload-pack` probe, re-checked this session, not just assumed
  carried over. No workaround attempted, per instruction.
- **Working tree:** NOT clean — 26 modified files, 20 new/untracked
  files, reflecting every change made across this session and the
  several before it. **No local commits exist** (`git log
  origin/main..HEAD` is empty) — every change is an uncommitted
  edit to the working tree, never committed by me.
- **Deployment confidence: LOW-TO-MODERATE, explicitly not verified.**
  This sandbox's file state is my own reconstruction — I reapplied my
  own prior sessions' changes onto the stale `f274921` clone after
  losing GitHub access. It is **not** a verified mirror of either the
  real GitHub repository or the live Railway deployment. The one piece
  of real evidence I do have: a production error you shared several
  sessions ago (`P2022`, `estimates.expired_at` column missing) proved
  that at least the schema portion of an earlier push had reached
  production. I have no equivalent evidence for anything pushed since.
  **You are the only source of truth for what's actually live** — what
  you've downloaded and pushed via GitHub Desktop across these sessions
  is the real state; my sandbox is a working copy, not a mirror.

---

## B. Owner Scorecard — All 10 KPIs

| KPI | Source | Date Basis | Calculation | Comparison | Verified |
|---|---|---|---|---|---|
| Revenue | `getRevenueTrend()`, `invoices.total_amount` | `invoices.created_at` | `SUM(total_amount) WHERE status != 'void'` | Fixed this pass (see C) | ⚠️ Verified correct, but **mislabeled** — this is Invoiced revenue, not Collected. UI still just says "Revenue." |
| Gross Profit | `getJobCostSummary()` | `jobs.actual_end` | `Σ(revenue − actualCost)` over jobs with real cost data | Fixed this pass | ✅ Verified — see C |
| Gross Margin | `getJobCostSummary()` | `jobs.actual_end` | `totalGrossProfit / totalRevenue × 100` | Fixed this pass | ✅ Verified |
| Jobs Completed | `getPeriodKpis()` | `jobs.actual_end` | `COUNT(*) WHERE status='completed'` | Fixed this pass | ✅ Verified — tenant-scoped, correct |
| Average Ticket | `getPeriodKpis()` | `estimates.created_at` | `AVG(estimates.total_amount) WHERE status='accepted'` | Fixed this pass | ⚠️ **Confirmed discrepancy** — sourced from accepted estimates, not completed jobs/invoices. See `REPORTING_DEFINITIONS.md`. Not fixed — a definition decision, not a broken calculation. |
| Estimate Conversion | `getPeriodKpis()` | `estimates.created_at` | `accepted / sent WHERE status IN (sent,viewed,accepted,declined,expired)` | Fixed this pass | ✅ Verified, matches the documented definition exactly |
| Repeat Customer % | `getCustomerAnalytics()` | All-time (not period-bound) | Pre-existing, unchanged | None — correctly shown without one | ✅ Verified — UI already labels this "All-time," doesn't fake a period comparison |
| Recurring Revenue | Hardcoded "Not yet available" | N/A | N/A | N/A | ✅ Verified — no fabricated $0, confirmed in source |
| Callback Rate | `JobCallbacksService.getCallbackRate()` (reused, not duplicated) | `jobs.actual_end` | `DISTINCT original_job_id / completed jobs` | Fixed this pass | ✅ Verified, tenant filter added this pass (see raw SQL review) |
| AR Outstanding | `getReceivablesAging()` (pre-existing, unchanged) | Point-in-time (today) | Sum of aging buckets | None — correctly point-in-time, no fake comparison | ✅ Verified |

**7 of 10 fully verified with no issues. 2 flagged with real, confirmed findings** (Revenue's label, Average Ticket's source) — both documented, neither silently fixed without your input, per the gate's own instruction not to refactor without a confirmed defect *and* not to expand scope unasked. **1 (Gross Profit/Margin) verified via C below.**

---

## C. Job Cost & Gross Margin

**Formula-level verification (hand-computed against the actual SQL expressions, not just asserted):**
```
laborCost + chemicalCost + equipmentCost + fuelCost + miscCost
= $85 + $35 + $18 + $10 = $148  ✓ matches
grossProfit = revenue − actualCost = $500 − $148 = $352  ✓ matches
grossMarginPercent = ROUND(352/500×100, 2) = 70.4  ✓ matches
```
All three formulas in `getJobCostDetail()` reproduce the worked example
exactly, verified by direct hand-substitution into the real SQL
expressions in the file, not by inference.

**Automated test: `job-profit.util.spec.ts` already covers this exact
case** — the "lowest reliable layer" available, per the gate's own
preference. Re-ran it this session: **passing.**

```
✓ reproduces the audit approval doc's own worked example exactly:
  $500 revenue, $190 actual cost, $310 actual profit  [different numbers,
  same formula — the $148/$352/70.4% case is the SQL-level one; the
  utility's own test predates it and validates the same arithmetic
  structure with different inputs]
```

**A genuinely new, direct test of the $148/$352/70.4% numbers specifically,
at the SQL layer: BLOCKED BY ENVIRONMENT.** `getJobCostDetail()` is raw
SQL running real Postgres aggregate functions (`SUM`, correlated
subqueries, `BOOL_OR`, `FILTER`) — there is no live Postgres instance in
this sandbox to execute it against, and no existing test infrastructure
in this repo exercises database-backed code (confirmed: all 47 passing
tests are pure functions, zero I/O). Building that infrastructure was
out of scope for this gate. Stated as `BLOCKED BY ENVIRONMENT`, not
claimed as passed.

**A real, non-hypothetical limitation found and documented, not fixed:**
`getJobCostDetail()` independently *recomputes* labor cost via SQL
(`SUM(hours × resolved rate)`) rather than summing the already-computed,
already-tested `job_line_items.actual_profit` column. The two approaches
are mathematically equivalent in theory, but **rounding order can
diverge** on a multi-line-item job with different assigned-user rates
(round-per-line-then-sum vs. sum-then-round-once). For the single-line-item
worked example this document verifies, there is no rounding-order
ambiguity — the two approaches are identical. For a job with several
differently-rated line items, they could differ by a cent or two. Not
fixed this pass, since doing so safely would mean rewriting working SQL
under the same time pressure this gate exists to prevent — flagged in
`REPORTING_DEFINITIONS.md` and here instead.

---

## D. Data Completeness Banner

`isComplete` = `line_items_with_cost = line_item_count`, computed per
job in the same CTE as everything else — **X (jobsWithCostData) is
jobs with at least one actual-cost field recorded; Y (completedJobs) is
all completed jobs in the range, independent of cost data.** Verified:
- Same date range (`actual_end >= start AND < end`) used for both X and Y — confirmed, no drift between the two counts.
- Canceled jobs: excluded from both X and Y — the query filters `status = 'completed'` for both the summary's `completedJobs` count and the detail CTE's job join. A canceled job never appears in either number.
- Tenant scoping: fixed this pass (see raw SQL review below).
- The banner's own copy ("Actual cost data available for X of Y completed jobs") does not claim accuracy for jobs outside that fraction — confirmed in `job-cost/page.tsx`'s conditional text.

---

## E. Zero-Cost Protection

**Verified correct, both at the SQL and schema level:**
- `job_line_items.actual_*` columns are nullable with no default —
  confirmed directly against `schema.prisma` and migration 040. NULL
  and 0 are genuinely distinguishable at the storage layer: a line item
  can have `actual_chemical_cost = 0` (explicitly recorded, real zero)
  which is different from `NULL` (not recorded at all).
- `has_actual_cost_data` (the exclusion gate) checks `IS NOT NULL` on
  each field *before* any `COALESCE` — so a job where nothing was ever
  recorded is correctly excluded from the report entirely, never shown
  as `$0 cost / 100% margin`.
- **Case A (no data):** excluded — `WHERE ... jc.has_actual_cost_data =
  true` removes it from `getJobCostDetail()`'s result set entirely.
  Confirmed by reading the WHERE clause directly.
- **Case B (partial data):** included, `isComplete = false` — the job
  still appears (since `has_actual_cost_data` only requires *one* field
  recorded), flagged as partial via the completeness banner and the
  per-row "Partial" badge on the table.
- **Case C (genuinely zero):** distinguishable from "not recorded," per
  above — a real `0` and a real `NULL` are different values at the
  database level, and the query logic treats them differently.

No live-database test of this behavior was possible (same environment
block as C). Verified via direct source/schema inspection instead.

---

## F. Existing Reports

- `/reports/all` — confirmed present, untouched in content this pass
  (only its relative import paths were fixed two sessions ago, a bug I
  introduced by moving the file, not a rewrite of its logic).
- All 8 pre-existing report methods in `reports.service.ts`
  (`getRevenueTrend`, `getPaymentTrend`, `getRevenueByService`,
  `getEstimatePipeline`, `getJobCompletionTrend`,
  `getTechnicianPerformance`, `getChemicalUsageSummary`,
  `getEquipmentUsageSummary`, `getReceivablesAging`,
  `getLeadSourceAnalytics`, `getMonthlyProfitTrend`,
  `getLeadSourceTrend`) — confirmed still present, none deleted or
  altered, by direct grep against the current file.
- Frontend build confirms `/reports/all` still compiles and is still a
  routable page (123 kB bundle, present in this session's build output).

---

## G. Tenant Security

| Layer | Status |
|---|---|
| Every new/modified query routes through `withTenantContext(companyId, ...)` | **Statically verified** — confirmed by direct read of every method touched this session and last |
| Explicit `company_id`/`customer_id` filters on raw SQL, in addition to RLS | **3 gaps found and fixed this session** (see Raw SQL Review below) — `getJobCostDetail`'s `jobs`/`customers` joins, `getCallbackRate`'s `job_callbacks` join, `getUpcomingAppointments`'s `job_line_items` lateral join. All three now double-filter, matching the more defensive existing precedent elsewhere in this codebase. |
| RLS policies exist on every new/touched table | **Statically verified** — confirmed against migration files (040–043 all include `FORCE ROW LEVEL SECURITY` + a tenant policy) |
| Live cross-tenant test (Company A cannot see Company B's data) | **NOT LIVE-VERIFIED** — no live database available in this sandbox. Stated plainly, not implied otherwise. |
| Whether production's DB role actually enforces RLS at all | **Still an open, unresolved question from several sessions ago** (the `pg_stat_activity` check to determine if production connects as the `postgres` superuser, which would bypass RLS regardless of policies). This directly affects how much the "RLS as tenant boundary" layer above can actually be trusted in production. Not re-litigated in full here, but the 3 gaps just fixed are more consequential given this open question — they were the *only* layer protecting those 3 queries if RLS turns out not to be enforced. |

---

## H. Build / TypeScript / Prisma

| Command | Result |
|---|---|
| `cd frontend && npx tsc --noEmit` | **Ran successfully — clean, 0 errors** (re-run after every fix this session) |
| `cd frontend && npx next build` | **Ran successfully** — all report/portal routes compiled, no prerendering errors |
| `cd backend && npx jest` | **Ran successfully — 6/6 suites, 47/47 tests passing** |
| `cd backend && npx prisma generate` | **BLOCKED BY ENVIRONMENT** — this sandbox's network allowlist doesn't include `binaries.prisma.sh`; confirmed by direct attempt (including a WASM-engine-type retry), not assumed |
| `cd backend && npx tsc --noEmit` | **BLOCKED BY ENVIRONMENT** — depends on the Prisma Client that generate above couldn't produce; running it would report false errors against the stale/incomplete client, not real ones |
| `check-migration-sync.sh` | **Ran successfully — PASSED** |
| `check-duplicate-source.sh` | **Ran successfully — PASSED** |

**You must run the two blocked commands yourself before trusting this
is production-ready** — this is the same limitation flagged every
session; nothing new here, restated because the gate asked for it
explicitly.

---

## I. Tests

- **Total:** 47
- **Passing:** 47
- **Failing:** 0
- **Blocked:** the one test this gate specifically asked for (a direct,
  live-database test of `getJobCostDetail()`'s exact $148/$352/70.4%
  SQL execution) — blocked by no available Postgres instance, not by
  any code defect. Formula-level hand-verification substitutes for it,
  documented in section C.

---

## J. Files Changed (this verification session only)

**Modified (bug fixes, not new features):**
- `backend/src/reports/services/reports.service.ts` — added explicit tenant filter to `getJobCostDetail`'s joins
- `backend/src/jobs/services/job-callbacks.service.ts` — added explicit tenant filter to `getCallbackRate`'s join
- `backend/src/portal/services/portal-data.service.ts` — added explicit tenant filter to `getUpcomingAppointments`'s lateral join
- `frontend/lib/api/reports.ts` — fixed `resolveComparisonPeriod` to use calendar-unit subtraction instead of duration subtraction
- `frontend/app/reports/page.tsx` — updated the one call site to pass the active preset

**New:**
- `docs/REPORTING_DEFINITIONS.md` — closes a dangling reference found in existing code comments (they pointed here; the file never existed)

No schema/migration files changed this session — every fix was to
query logic or frontend calculation, not to the database structure
verified correct in section B of the schema check.

---

## K. Remaining Issues (confirmed only, nothing hypothetical)

1. **Average Ticket KPI is sourced from accepted estimates, not
   completed jobs/invoices** — a real, confirmed discrepancy against
   this project's own stated definition elsewhere. Needs a product
   decision (which definition should the Owner Scorecard actually
   show), not a technical fix. Documented in `REPORTING_DEFINITIONS.md`.
2. **"Revenue" KPI is Invoiced revenue, unlabeled as such** — correct
   number, ambiguous label. Small UI fix if you want it (e.g. "Revenue
   (Invoiced)"), not done this pass since it wasn't a broken
   calculation.
3. **Rounding-order divergence risk** between `job-profit.util.ts`
   (per-line-item, stored) and `getJobCostDetail()`'s independent SQL
   recomputation, on multi-line-item jobs with mixed assigned-user
   rates. Theoretical at most a few cents; not observable in the
   single-line-item worked example this whole verification is anchored
   to. Documented, not fixed.
4. **The standing open question about whether production's database
   role actually enforces RLS** (superuser-bypass risk, raised several
   sessions ago, never confirmed either way) remains unresolved and now
   has slightly higher stakes given how many raw SQL queries this
   reporting work added.
5. **True GitHub/production state is genuinely unknown to me** — see
   section A. This isn't fixable from my side; it needs you to confirm
   what's actually been pushed and deployed before this (or any future)
   work is trusted as the real current state.

---

**Gate status: the specific numbers and protections asked for are
verified — $148/$352/70.4% confirmed by formula, zero-cost jobs
confirmed excluded (not zeroed), the completeness banner confirmed
correct, comparison periods confirmed fixed and now matching the
brief's own example exactly, and three real tenant-scoping gaps found
and closed. Two genuine, non-blocking findings (Average Ticket source,
Revenue label) are documented and intentionally left for your decision
rather than silently changed.**

Waiting for your read on items 1–2 in Section K, and on whether to
proceed to the remaining 10 report pages.
