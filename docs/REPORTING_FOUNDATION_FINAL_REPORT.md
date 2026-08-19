# RENOVO — REPORTING FOUNDATION CHANGES: FINAL REPORT

Implementation of the 6 approved changes from the reporting-foundation
audit. Traced and written against commit `f274921`. **Could not be
fully build-verified in this sandbox** — see Verification Limitations
below before merging.

---

## A. Files Changed

**New files (9):**
- `backend/prisma/migrations/040_add_job_line_item_actual_costs.sql`
- `backend/prisma/migrations/041_add_chemical_cost_tracking.sql`
- `backend/prisma/migrations/042_add_job_callbacks.sql`
- `backend/prisma/migrations/043_add_estimate_expired_at.sql`
- `backend/src/jobs/services/job-profit.util.ts`
- `backend/src/jobs/services/job-profit.util.spec.ts`
- `backend/src/jobs/services/job-callbacks.service.ts`
- `init-scripts/040`–`043` (mirrors of the four migrations above)
- `init-scripts/038_add_custom_service_name.sql`,
  `038b_trimmed_no_catalog.sql`, `039_add_data_deletion_log.sql` — see
  "Unplanned fix" below; not part of the 6 approved items.

**Modified files (14):**
`backend/prisma/schema.prisma` · `backend/src/jobs/dto/job.dto.ts` ·
`backend/src/jobs/jobs.controller.ts` · `backend/src/jobs/jobs.module.ts` ·
`backend/src/jobs/services/jobs.service.ts` ·
`backend/src/jobs/services/job-field-ops.service.ts` ·
`backend/src/estimates/services/estimates.service.ts` ·
`backend/src/customers/customers.controller.ts` ·
`backend/src/customers/customers.module.ts` ·
`backend/src/customers/services/customers.service.ts` ·
`backend/src/reports/services/reports.service.ts` ·
`backend/src/settings/dto/settings.dto.ts` ·
`backend/src/settings/services/settings.service.ts` ·
`backend/src/settings/settings.controller.ts` ·
`backend/src/settings/settings.module.ts`

---

## B. Schema Changes

**Migration 040** — `job_line_items`: adds `actual_labor_hours`,
`actual_chemical_cost`, `actual_equipment_cost`, `actual_fuel_cost`,
`actual_misc_cost`, `actual_profit`, `actual_profit_margin_percent`,
`assigned_user_id`. All nullable, all `CHECK (... IS NULL OR ... >= 0)`,
none defaulted to 0. Adds permission `jobs.profitability`, granted to
owner/admin.

**Migration 041** — new table `chemical_cost_rates`
(`company_id, chemical_name, unit, cost_per_unit`, unique on the first
three), RLS + FORCE RLS + tenant policy. Adds `unit_cost_snapshot`,
`total_cost` to `job_chemical_usage`, both nullable.

**Migration 042** — new table `job_callbacks`
(`original_job_id`, `new_job_id` nullable, `customer_id`, `reason`
CHECK-constrained to 6 values, `status` CHECK-constrained to
open/resolved/cancelled, `resolution`, three nullable cost/refund
columns, `notes`), 3 indexes, RLS + FORCE RLS + tenant policy. Adds
permission `jobs.callbacks`, granted to owner/admin.

**Migration 043** — `estimates`: adds nullable `expired_at`.

All four are strictly additive (`ADD COLUMN`/`CREATE TABLE` only), no
`ALTER`/`DROP` on any existing column, no data migration or backfill of
any kind — matching Section 9's explicit constraint.

---

## C. Existing Infrastructure Reused

- **`resolveLaborRate()`** (`estimate-profit.util.ts`) — imported
  directly into `jobs.service.ts`, not reimplemented. The job side asks
  "which rate applies" exactly the same way the estimate side does.
- **The `computeAndSave*Profitability` / `applyProfitabilityVisibility`
  pattern** from `EstimatesService` — mirrored structurally in
  `JobsService` (same trigger point, same permission-gated stripping at
  the `findOne` boundary), not a new architecture.
- **`estimates.profitability`'s permission-grant pattern** (migration
  010) — `jobs.profitability` and `jobs.callbacks` both follow the exact
  same owner/admin-only grant shape.
- **`estimates.service.ts::markExpired`** — extended in place (now also
  sets `expiredAt`), not duplicated. Both the manual staff action and
  the automation cron already call this one method, so both paths get
  the new timestamp automatically.
- **`getLeadSourceAnalytics()`'s correct `customers.lifetime_value`
  usage** — `getCustomerAnalytics()` now matches it instead of
  maintaining a second, disagreeing calculation.
- **Settings → Lead Sources' existing configured list** — the new
  validation reads it live via `SettingsService.getLeadSources()`, not a
  duplicated copy of the default list.
- **The `'field' in dto ? ... : existing.field` explicit-null-vs-omitted
  pattern** — used consistently across `updateLineItemActualCosts` and
  `JobCallbacksService.update`, a genuinely new (if small) convention
  this work introduced, since no existing endpoint needed to distinguish
  "clear a value" from "leave it alone" before now.

---

## D. Six Changes Completed

1. **JobLineItem actual costs** — Done. Schema, calculation utility
   (tested), service wiring, new `PATCH
   /jobs/:id/line-items/:lineItemId/actual-costs` endpoint,
   permission-gated read/write.
2. **Chemical cost snapshot** — Done. `ChemicalCostRate` reference table
   + CRUD under `Settings → Chemical Costs`, snapshot-on-write logic in
   both `addChemicalUsage` and `updateChemicalUsage` (re-snapshots only
   when the chemical identity changes, not on a quantity-only edit).
3. **JobCallback** — Done. Table, full CRUD service
   (`JobCallbacksService`), 3 new endpoints under `/jobs/:id/callbacks`,
   plus `getCallbackRate()` implementing the exact
   Callback-Jobs/Completed-Jobs definition from the approval doc.
4. **Estimate.expiredAt** — Done. Single-column addition,
   `markExpired` extended to set it.
5. **Lead source validation** — Done, but deliberately narrower in
   scope than a literal reading of the brief — see Data Quality below
   for why.
6. **CLV correction** — Done. `getCustomerAnalytics()` now reads
   `customers.lifetime_value` instead of `SUM(invoices.total_amount)`.

---

## E. Reporting Readiness — Updated Matrix

| # | Report | Before this pass | After this pass |
|---|---|---|---|
| 1 | Revenue & Sales Performance | Mostly ready | Unchanged |
| 2 | Estimate Conversion | Ready | Ready (now with a direct `expiredAt` column) |
| 3 | Average Ticket | Ready | Unchanged |
| 4 | Lead Source Performance | Mostly ready | Ready — vocabulary now server-enforced on the primary internal path |
| 5 | Service Profitability | Partial | **Ready** — job-level actual costs now exist |
| 6 | Job Cost & Gross Margin | **Not ready** | **Ready**, pending real data entry through the new endpoint (schema/calc are done; no historical data exists yet — see Data Quality) |
| 7 | Customer Lifetime Value | Ready but internally inconsistent | **Ready and internally consistent** — the bug is fixed |
| 8 | Crew/Technician Performance | Partial | Unchanged (multi-technician still out of scope, as instructed) |
| 9 | Route & Job Efficiency | Partial | Unchanged (travel time still out of scope, as instructed) |
| 10 | Customer Satisfaction & Callback | Partial | **Ready** — `JobCallback` + `getCallbackRate()` now exist |
| 11 | Repeat & Recurring Customer Performance | Partial | Unchanged (recurring billing still out of scope, as instructed) |
| 12 | Accounts Receivable & Cash | Ready | Unchanged |

**Net: 3 reports moved from Partial/Not-Ready to Ready** (5, 6, 10), one
correctness bug fixed (7), one gap tightened (4). 4 reports remain
Partial, exactly the ones the approval doc explicitly said not to touch
this pass.

---

## F. Data Quality

**No historical backfill was performed anywhere, on principle, per
Section 10's explicit instruction.**

- Every existing `job_line_items` row has `actual_*` columns = NULL.
  This is correct, not a defect — no job completed before this migration
  has real actual-cost data, and none was fabricated. Report #6 will
  correctly show "no data" for historical jobs and only report on jobs
  where someone actually enters actual costs going forward through the
  new endpoint.
- Every existing `job_chemical_usage` row has `unit_cost_snapshot`/
  `total_cost` = NULL, for the same reason — no `chemical_cost_rates`
  entries exist yet (the table is brand new), so nothing could have
  matched even if snapshot logic ran retroactively, which it does not.
- `job_callbacks` starts empty — no attempt was made to reconstruct past
  callbacks from job notes or any other source.
- `estimates.expired_at` is NULL on every estimate that was already
  `'expired'` before this migration ran. A future backfill (setting
  `expired_at = updated_at` for already-expired rows) is *possible* and
  low-risk, but I did not do it — that's a judgment call for you, not
  something to decide unilaterally.
- **Lead source historical audit could not be performed.** I do not
  have network access to your production database from this
  environment, so Section 5's requested steps ("audit existing values,
  identify nonstandard ones, report them") were not completable this
  pass. The validation I built is deliberately structured so it can't
  retroactively invalidate anything: an existing customer's unchanged
  source always passes, regardless of what it is.

---

## G. Tests

**Executed and passing** (ran directly in this session):
```
PASS src/jobs/services/job-profit.util.spec.ts   (7 tests, new)
PASS src/estimates/services/estimate-profit.util.spec.ts  (unchanged, still passing)
PASS src/estimates/services/estimate-totals.util.spec.ts  (unchanged, still passing)

Test Suites: 3 passed, 3 total
Tests:       20 passed, 20 total
```

The new suite includes a test that reproduces the approval doc's own
worked example exactly (`$500 revenue, $190 actual cost → $310 actual
profit, 62% margin`).

**Not executed — see Verification Limitations.** No integration tests
were added for `JobCallbacksService`, the chemical cost snapshot logic,
the lead source validation, or the CLV query fix, because none of the
existing test infrastructure in this repo exercises database-backed
code (the entire existing test suite — 5 files before this pass — is
pure unit tests on functions with zero I/O; there is no existing
pattern for a DB-backed integration test to extend). Building that
infrastructure from scratch was outside this task's scope. This is a
real, honest gap, not an oversight — flagging per Section 9's own
instruction to report what wasn't tested, not just what was.

---

## H. Security

Every new table (`chemical_cost_rates`, `job_callbacks`) has RLS +
`FORCE ROW LEVEL SECURITY` + an explicit tenant-isolation policy,
matching the exact pattern of every other tenant-scoped table in this
schema — confirmed directly against migration 039's syntax before
writing 041/042, not assumed. Every new/modified service method routes
through `this.prisma.withTenantContext(companyId, ...)`.

**Not independently tested against a live database** — same network
limitation as above. I could not spin up Postgres and confirm
cross-tenant isolation empirically for the new tables/endpoints. The
policy SQL is syntactically and structurally identical to already-
verified tables, which is meaningful evidence but not the same as a
live test. Recommend a manual cross-tenant check (create data in two
test companies, confirm neither can see the other's chemical costs/
callbacks/actual costs) before this reaches production.

---

## I. Remaining Gaps — Answering the Required Final Question

> After these six changes, what data is still missing before Renovo can
> reliably generate all 12 reports?

**Genuinely missing, unchanged by this pass (all deliberately out of
scope, per your own instruction):**
- Multi-technician-per-job labor splitting (Report #8)
- Inter-job travel time (Report #9)
- Active recurring-service/subscription data model (Report #11)

**Newly capable but empty — the schema/logic exists, the data doesn't
yet, because nothing has used the new endpoints in production:**
- Job-level actual costs (Report #6) — needs someone to actually record
  costs through the new endpoint before this report has anything to show
- Chemical cost rates (feeds #5/#6) — `chemical_cost_rates` starts
  empty; needs the company to populate current costs under
  Settings → Chemical Costs before any chemical cost snapshotting can
  happen
- Callbacks (Report #10) — `job_callbacks` starts empty; the rate will
  correctly show 0% until callbacks actually get logged

**A frontend gap, not a data gap:** none of this session's work touched
the frontend. There is no UI yet for entering job actual costs,
managing chemical cost rates, or logging a callback — only the backend
API surface exists. Building that UI was not requested by the approval
doc (which explicitly scoped this to "data collection + data integrity
+ reporting foundation," not the dashboard/UI phase) and I did not
build it. Staff would need to use the API directly today; a future
phase needs to decide where this UI lives (Job detail page seems the
natural home for all three, but that's your call).

**One item explicitly deferred by design, not fixed:** the three
disconnected lead-source vocabularies (internal form's configurable
list, the public Leads DTO's own hardcoded 4-value enum, CSV import's
unvalidated free text) remain disconnected. I validated only the
internal Customer create/update path. Unifying all three would be a
bigger, riskier change than this task authorized — flagged for an
explicit decision, not silently resolved.

---

## Unplanned fix made along the way

`init-scripts/` was missing 3 pre-existing migrations
(`038_add_custom_service_name.sql`, `038b_trimmed_no_catalog.sql`,
`039_add_data_deletion_log.sql`) — confirmed via
`scripts/check-migration-sync.sh`, which failed before I'd touched
anything related to this. This predates this session's work entirely.
I mirrored all three (byte-for-byte copies of already-existing,
already-in-production migrations — no new SQL authored) because the
sync check would otherwise fail on CI for reasons unrelated to the 6
approved changes, blocking a clean merge. Both `check-migration-sync.sh`
and `check-duplicate-source.sh` now pass locally. Flagging this
explicitly rather than folding it silently into the diff.

---

## Verification Limitations — Read Before Merging

**I could not run `npx prisma generate`, `npx tsc --noEmit`, or
`npx next build` in this session.** This sandbox's network allowlist
does not include `binaries.prisma.sh`, which `prisma generate` requires
to fetch its schema/query engine — confirmed by direct attempt, not
assumed, including trying the WASM engine type as an alternative, which
still requires the same download for schema validation. This blocks all
downstream TypeScript verification, since the generated Prisma Client
types are what `tsc` checks new model/field references against.

**What I did instead, as real substitutes:**
- Ran the 3-file, 20-test pure-function suite directly — all passing,
  including 7 new tests.
- Ran both `check-migration-sync.sh` and `check-duplicate-source.sh`
  directly — both passing.
- Manually verified every new Prisma Client call
  (`.upsert`, `.findFirst`, `.findUnique`, `.delete`) against the exact
  method signatures and composite-key naming Prisma generates from the
  `@@unique([...])` declarations I wrote, cross-checked against existing
  correct usage elsewhere in this codebase.
- Manually verified brace/model/`@@map` balance across the full
  941-line → 1019-line schema file.

**What you must do before pushing, that I could not:**
```powershell
cd C:\Users\LEO\Downloads\renovo-crm-system\backend
```
```powershell
npx prisma generate
```
```powershell
npx tsc --noEmit
```
```powershell
npm test
```
```powershell
cd ..\frontend
```
```powershell
npx tsc --noEmit
```
```powershell
npx next build
```

If `tsc --noEmit` in the backend surfaces anything, it's most likely to
be in `jobs.service.ts`'s new methods or `job-callbacks.service.ts`,
since those are the most Prisma-Client-type-dependent new code — start
there if something doesn't compile clean.

**Also required before this is live:** the migration itself needs to
actually run on Railway. Confirm (don't assume) that Railway's
Pre-Deploy Command is wired to `scripts/run-migrations.sh` per the
standing open question from an earlier session, or run the four new
migration files manually against production if it isn't.
