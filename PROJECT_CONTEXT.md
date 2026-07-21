# PROJECT_CONTEXT.md

**CRM Version:** v0.26.0
**Last Updated:** 2026-07-21
**Current Phase:** Production Hardening
**Status:** Production Ready
**Last Completed Module:** Automation Settings
**Next Module:** Estimate Expiration Workflow

> Purpose: let any future Claude session understand this codebase's current
> architecture without rediscovering it from scratch. This is not a
> changelog. It describes what exists today, not the history of how it
> got here.

---

## 1. Project Overview

Renovo CRM is a business-management system for pressure washing companies —
leads, customers, estimates, jobs, scheduling, invoicing, payments, and
customer communication in one place.

**Target users:** Solo owner-operators and small crews. The active
build/priority focus is currently a single-owner workflow (no employees) —
features that only make sense at multi-employee scale (user roles, crew
assignment) are built but intentionally de-prioritized for polish.

**Current business workflow:** Estimate → accepted → converted to a Job →
scheduled → completed → converted to an Invoice → paid → (optional) review
request / recurring-service reminder. See Section 6.

**Design philosophy:**
- Extend existing modules before adding new screens or parallel systems.
- Server computes anything financial (totals, tax, discounts) — never
  trust client-submitted numbers.
- Every tenant-scoped table is protected by Postgres Row-Level Security;
  application code never relies solely on `WHERE company_id = ...`
  discipline.
- Real integrations degrade gracefully when unconfigured (Twilio,
  Postmark, Stripe, AWS) — they log their own state at boot rather than
  failing silently later.

**Architectural principles:**
- Additive-only database migrations (see Section 9).
- Shared computation/formatting logic lives in one place
  (`common/utils/`) and is imported, never re-implemented per module.
- Raw SQL (`$queryRawUnsafe`) is used in several services for
  performance/complex joins; every parameter compared against a typed
  Postgres column (`uuid`, `jsonb`) must carry an explicit cast
  (`$1::uuid`, `$2::jsonb`) — Postgres will not infer this.

---

## 2. Current Architecture

**Frontend:** Next.js (App Router) at `frontend/`. Route groups: `(auth)`
for unauthenticated flows; feature folders (`customers`, `estimates`,
`jobs`, `invoices`, `payments`, `scheduling`, `reports`,
`service-catalog`, `settings`) for the authenticated staff app.
Dynamic settings sections render through a single `[section]` route.

**Backend:** NestJS at `backend/src/`, one module per domain (see
Section 3's table). Structured JSON logging via pino, with Authorization
headers/cookies/passwords redacted. A global exception filter
distinguishes intentional application errors (safe to show the client)
from unexpected ones (generic message to client, full detail logged
server-side).

**Database:** PostgreSQL, accessed through Prisma for typed
queries/mutations and raw SQL (`$queryRawUnsafe`) for complex joins and
reporting queries. Migrations are hand-numbered SQL files in
`backend/prisma/migrations/`, applied via a plain `psql` loop (documented
in `docs/GETTING_STARTED.md`) — **not** `prisma migrate dev/deploy**;
this project does not use Prisma's own migration engine.

**Authentication:** JWT access/refresh tokens (`auth/` module),
email/password plus optional Google/Microsoft OAuth (degrades gracefully
if unconfigured). Magic-link auth exists separately for the customer
portal (`portal/` module).

**RLS (Row-Level Security):** Every tenant-scoped Postgres table has an
RLS policy keyed on `company_id`. The Postgres session variable RLS
depends on is set exclusively through `PrismaService.withTenantContext`.

**Tenant context propagation:** `TenantContextService`
(`common/tenant/tenant-context.service.ts`) uses `AsyncLocalStorage` to
carry `companyId` through the async call stack, set once per request by
`TenantContextInterceptor`. Any tenant-scoped query reached without this
context set is a bug, not a valid request path (`requireCompanyId()`
throws).

**Permissions:** Two layers. Backend: `PermissionsGuard`/`RolesGuard`
(`auth/`) are the actual enforcement boundary. Frontend:
`<PermissionGate>` (`components/auth/permission-gate.tsx`) is a UX
convenience only — hides buttons/sections a user lacks permission for,
but is explicitly documented as not a security boundary.

**Shared utilities:** `backend/src/common/` — `PrismaService`
(tenant-aware Prisma wrapper), `TenantContextService`/
`TenantContextInterceptor`, `AllExceptionsFilter`, `StorageService` (S3
presigned URLs), `IntegrationStatusService` (boot-time integration
health), `RedisModule`, `document-totals.util.ts`
(`computeDocumentTotals`), `automation-event.util.ts`, `slugify.ts`.

**Automation:** Cron-driven engine (`automation/` module) — estimate
follow-ups, recurring-maintenance reminders, review requests. Sends real
SMS (Twilio) / email (Postmark) when configured; logs and no-ops
otherwise. Configuration is now reachable through a real settings UI
(`frontend/app/settings/automation`, migration `026`).

**Reports:** `reports/` module, real backend with dedicated services and
DTOs; frontend page exists at `frontend/app/reports`.

**Settings:** `settings/` module backs a unified settings UI
(`SettingsSectionShell.tsx` + dynamic `[section]` route) covering
Company, Branding, Business Defaults, Payments, Email, SMS, Storage,
Automation. Users & Roles, API Keys, and several others remain
UI-stubbed ("Soon") — backend not built for those yet.

**PDF system:** Generated server-side in `invoices/` (and related
`documents/` services) for invoice PDFs; `company-context.service.ts`
supplies branding/reply-to data into that generation path.

**Email system:** `mail/` module (BullMQ-style processor,
`mail.processor.ts`) sends and logs outbound mail; `email-log` table and
`documents/services/email-log.service.ts` track per-document send
history (used by Invoice "Email History").

**Payments:** `payments/` module — real payment recording against
invoices; Stripe success-path webhook handling exists.
`payment_intent.payment_failed` is not yet handled (known limitation,
Section 7).

**Scheduling:** `scheduling/` module — calendar-backed appointment
scheduling with technician assignment. Assignment concept assumes
multi-tech; for the current solo-owner priority, this is a known
friction point (Section 7), not yet resolved.

---

## 3. Production Modules

| Module | Status | Production-Ready | Key Architectural Decisions | Shared Components/Services Used |
|---|---|---|---|---|
| Authentication | Complete | Yes | JWT access/refresh; optional OAuth degrades gracefully; company invites | `auth/` guards, `TenantContextInterceptor` |
| Customers | Complete | Yes | Duplicate detection/merge, CSV import/export, presigned S3 uploads | `StorageService`, `customer-table.tsx`, `import-csv-modal.tsx` |
| Estimates | Complete | Yes | Server-computed totals; service-specific validated detail fields; one-click convert-to-job | `computeDocumentTotals`, `EstimateForm.tsx`, `ActionBar.tsx`, `StatusTimeline.tsx` |
| Jobs | Complete | Yes | One-click generate-invoice-from-job; completion flow with photos/signature | `CompletionFlow.tsx`, `PhotoSection.tsx`, `SignaturePad.tsx`, `ChemicalSection.tsx`, `EquipmentSection.tsx` |
| Scheduling | Complete | Yes (multi-tech assumption not yet simplified for solo use) | Technician-assignment model built for crews | `AppointmentDetailPanel.tsx` |
| Invoices | Complete | Yes | Server-computed totals; PDF + email send; email history tracking | `computeDocumentTotals`, `DocumentEmailSection.tsx`, `email-log.service.ts` |
| Payments | Complete (success path only) | Partial — failed-payment webhook not handled | Manual payment recording + Stripe success webhook | `PaymentsSection.tsx` |
| Reports | Complete | Yes | Dedicated services/DTOs, real backend | — |
| Service Catalog | Complete | Yes | Backs Estimates' per-service pricing/validation | — |
| Settings | Partial | Yes for built sections; several sections UI-only | Unified shell + dynamic section routing | `SettingsSectionShell.tsx` |
| Customer Portal | Backend complete, frontend unconfirmed | Backend yes; frontend status unverified | Magic-link auth; scoped AI chat; Stripe payment | — |
| AI Receptionist | Backend built, untested live | No | Twilio-integrated call handling; no settings UI yet | — |
| Automation | Complete | Yes | Cron-driven; real SMS/email; now has a settings UI | `automation-event.util.ts` |
| Leads | Not built | No | Nav entry exists, marked "Soon" | — |
| Properties | Sub-feature of Customers only | Yes (as-is) | No dedicated page by design — avoids duplicate system | — |

---

## 4. Shared Systems

**`computeDocumentTotals`** (`backend/src/common/utils/document-totals.util.ts`)
Purpose: single source of truth for subtotal/discount/tax/total math.
Used in: Estimates, Invoices (anywhere a document total is computed).
Extend by: adding new discount/tax modes here only — never re-derive
totals inline in a service.

**`StatusBadge` / `StatusTimeline`** (`frontend/components/action-center/`)
Purpose: consistent status rendering and history display across
document-like entities (estimates, jobs, invoices).
Extend by: adding new status values to the shared enum/mapping, not by
building a one-off badge in a feature folder.

**`ConfirmDialog`** (`frontend/components/action-center/ConfirmDialog.tsx`)
Purpose: the app's real confirmation dialog. **Known gap:** Invoice Void
still uses the browser's native `confirm()` instead of this — flagged in
Section 7, not yet fixed.

**`DocumentEmailSection`** (`frontend/components/documents/DocumentEmailSection.tsx`)
Purpose: shared "send this document by email + history" UI, used by
Invoices; designed to be reusable if Estimates ever needs the same UI.

**`SettingsSectionShell`** (`frontend/components/settings/SettingsSectionShell.tsx`)
Purpose: the one settings-page layout. Every settings section (Company,
Branding, Automation, etc.) renders inside this shell via the dynamic
`[section]` route — new settings pages should extend this, not build a
standalone page.

**`TenantContextService` / `TenantContextInterceptor`** (`backend/src/common/tenant/`)
Purpose: the only mechanism that sets the Postgres session variable RLS
depends on. Every tenant-scoped controller must sit behind
`TenantContextInterceptor`. Extend by: never bypassing this to call
Prisma directly for a tenant-scoped model.

**Automation Engine** (`backend/src/automation/`)
Purpose: cron-driven follow-ups, recurring reminders, review requests.
Extend by: adding new rule types to this engine, not building a second
scheduler.

**Email system** (`backend/src/mail/`, `email-log` table)
Purpose: single outbound-mail path with logging. Extend by: routing new
transactional email types through `mail.processor.ts`, not calling
Postmark directly from a feature service.

**Permission system** (`auth/` guards + `PermissionGate.tsx`)
Purpose: backend guards are the real boundary; `PermissionGate` is
UI-only convenience. Extend by: adding new permission strings to the
backend guard definitions first; frontend gating follows, never leads.

**Raw SQL type-cast convention**
Purpose: prevent `operator does not exist` / `column is of type X`
errors. Rule: any `$queryRawUnsafe`/`$executeRawUnsafe` parameter
compared against or assigned into a `uuid` or `jsonb` column must be
explicitly cast (`$1::uuid`, `$2::jsonb`) in the SQL string itself.

---

## 5. Database Design

(Summarized — not a schema dump. See `renovo_crm_schema.sql` +
`backend/prisma/migrations/` for full detail.)

- **estimates → estimate_line_items**: one-to-many; line items carry
  service-specific JSONB detail fields validated per service type.
  Estimates carry the full cost/profitability breakdown, gated behind a
  dedicated permission, never exposed to the customer portal.
- **estimates → jobs**: an accepted estimate converts to a job
  (`convertToJob`); the job references its originating estimate.
- **jobs → invoices**: `generateFromJob` creates an invoice from a
  completed job's real line items, current tax rate, and due-date
  defaults — not a manual re-entry.
- **invoices → payments**: one-to-many; payments recorded against a
  specific invoice, feeding `Balance Due`.
- **invoices.viewed_at**: real, intentional column (migration `022`) —
  set when a customer views their invoice via the portal
  (`portal-data.service.ts`). Do not remove this field; it backs a real
  feature.
- **email_log**: polymorphic log table (`related_type` + `related_id`)
  tracking outbound email per document (currently invoices); `related_id`
  and `company_id` are `uuid` columns — raw queries against this table
  must cast parameters (see Section 4).
- **companies.business_hours**: `jsonb` column; the DTO layer
  (`settings.dto.ts`) declares each weekday explicitly as its own
  validated property rather than a generic `Record<string, ...>`, so
  NestJS's whitelist validation recognizes the keys.
- **companies.settings**: `jsonb` blob merged via `jsonb_set` (not
  overwritten wholesale) for sub-sections like branding.
- **service_catalog**: backs Estimates' per-line-item pricing and
  service-specific validated fields.
- **automation**: rule/event tables driving the cron engine; extended in
  migration `026` to support the new settings UI.
- **scheduling**: appointment records reference a technician
  (`assignedTo`/technician id) — a multi-tech assumption baked into the
  schema, not yet simplified for solo-owner use.
- **audit history pattern**: status-change history is modeled per
  document type (estimates/jobs/invoices) and rendered through the
  shared `StatusTimeline` component rather than a single global audit
  table.

---

## 6. Business Workflow

```
Lead (future)
  ↓
Estimate — created (optionally pre-filled from an existing Customer/Property), priced server-side
  ↓
Accepted — customer accepts via portal or staff marks accepted
  ↓
Job — one-click convertToJob() from the accepted estimate; carries the estimate's line items forward
  ↓
Scheduling — job gets a date/time and (currently) a technician assignment
  ↓
Completed — CompletionFlow captures photos, signature, chemicals/equipment used
  ↓
Invoice — one-click generateFromJob() from the completed job's real line items and current tax rate
  ↓
Payment — recorded manually or via Stripe (success path only)
  ↓
Review Request — automation engine can trigger post-payment, if configured
  ↓
Recurring Reminder — automation engine can schedule maintenance follow-ups, if configured
```

---

## 7. Current Known Limitations

**High**
- None currently open.

**Medium**
- Stripe `payment_intent.payment_failed` webhook is not implemented —
  only the success path is handled.
- Scheduling/Jobs assume multi-technician assignment; no solo-owner
  auto-assign-to-self shortcut exists yet, adding an unnecessary click on
  every job.
- AI Receptionist backend is untested against a live call and has no
  settings UI.

**Low**
- Invoice Void uses the browser's native `confirm()` instead of the
  shared `ConfirmDialog` component.
- Customer Portal frontend status is unconfirmed — backend is real and
  tested, but frontend completeness hasn't been directly verified in
  this context.

---

## 8. Future Roadmap

**Next**
- Solo-owner auto-assign (remove/simplify the technician picker for
  single-operator accounts) — highest daily-friction fix identified in
  the solo-owner workflow audit.
- Stripe failed-payment webhook handling.

**Later**
- On-site/mobile payment collection flow surfaced directly from the
  Job/Invoice screen (payment link or prominent "mark paid").
- Confirm and, if needed, build out the Customer Portal frontend.

**Someday**
- Leads module (only becomes valuable once call/inquiry volume exceeds
  what going straight into Customers can handle).
- Users & Roles, multi-tech features generally — deferred until there
  are actual employees.
- AI Receptionist settings UI + live-call validation.

---

## 9. Coding Standards

- **Additive migrations only.** Never edit a shipped migration file;
  add a new numbered one.
- **Never duplicate business logic.** Financial totals go through
  `computeDocumentTotals`; tenant scoping goes through
  `TenantContextService`; outbound email goes through `mail.processor.ts`.
- **Extend existing systems first.** A new settings page extends
  `SettingsSectionShell`; a new status display extends `StatusBadge`/
  `StatusTimeline`. Do not build a parallel one-off version.
- **RLS-safe.** Any new tenant-scoped table gets a real RLS policy and
  is only ever queried through the tenant-context-aware path.
- **Raw SQL casts required.** Any `$queryRawUnsafe` parameter touching a
  `uuid` or `jsonb` column is explicitly cast in the SQL string.
- **No parallel implementations.** One PDF system, one email system,
  one automation engine, one permission system — new features integrate
  with these, they don't reimplement a narrower version.
- **Production-ready over "nice architecture."** Features are built to
  the depth the solo-owner workflow actually needs, not to demonstrate
  enterprise completeness.
- **Verify before calling something done:**
  - Verify against a real Postgres instance (not just Prisma's type
    layer) — several real bugs (see project history) only surfaced
    against actual Postgres type-checking.
  - Verify TypeScript compiles clean (`tsc`/`npm run build`).
  - Verify migrations actually apply cleanly, in order.
  - Verify the frontend build (`next build`) where frontend changes are
    involved.

---

## 11. Architecture Decisions (ADR)

A record of *why*, so future sessions never have to re-litigate these.
Do not revisit any of these unless the workflow itself is changing.

### ADR-001
**Decision:** Accepting an Estimate automatically creates a Job.
**Reason:** Prevents accepted work from being forgotten. Verified directly
in `estimates.service.ts::acceptManually` — job creation
(`jobsService.createFromEstimate`) happens inline as part of acceptance,
protected by a duplicate-creation guard. Job starts in "Needs Scheduling."
**Status:** Implemented and verified.

### ADR-002
**Decision:** Appointments are the single scheduling backbone.
**Reason:** Already consumed by the AI Receptionist and Customer Portal.
`jobs.scheduled_start` (verified present in `schema.prisma`) is
denormalized data only — never a second source of scheduling truth.
**Rule:** Never create a second scheduling system.

### ADR-003
**Decision:** Service Catalog remains optional, not mandatory.
**Reason:** Owners must be able to override pricing/descriptions per
estimate. Line items always remain directly editable regardless of
catalog state.

### ADR-004
**Decision:** Branding is never copied into documents at creation time.
**Reason:** Branding is read live from Settings at render/PDF-generation
time (`company-context.service.ts`). Invoices store financial data only —
not a branding snapshot.

### ADR-005
**Decision:** Automation uses exactly one engine.
**Reason:** All automated messaging (follow-ups, reminders, review
requests) runs through the existing cron-driven engine in `automation/`.
**Rule:** Never create a second cron job or parallel scheduler — new
automation types extend this engine's rule types (see migration `027`'s
`rule_type` CHECK constraint extension as the established pattern).

### ADR-006
**Decision:** Every query touching a tenant-scoped table must execute
through `withTenantContext`.
**Reason:** This is the only mechanism that sets the Postgres session
variable RLS depends on (verified in `prisma.service.ts`).
**Rule:** Never call the base Prisma client directly for a tenant-scoped
model.

### ADR-007
**Decision (as verified, not as originally drafted):** Acceptance
auto-creates the Job (see ADR-001). **However**, a manual
`POST /estimates/:id/convert-to-job` endpoint (`convertToJob` in
`estimates.controller.ts`/`estimates.service.ts`) is **still live** — this
was not removed when auto-creation was added.
**Open item, not yet decided:** whether this manual endpoint should be
deprecated/removed now that acceptance handles it automatically, or kept
intentionally as a manual override/repair path. Do not assume it's dead
code, and do not assume it's intentional — this needs an explicit
decision, not a silent audit-and-forget.
**Lifecycle as it actually runs today:**
```
Draft → Sent → Viewed → Accepted → Job Created Automatically → Needs Scheduling
```
(the manual convert endpoint above still exists alongside this)

### ADR-008
**Decision:** All document total calculations use `computeDocumentTotals`.
**Reason:** Single source of truth for subtotal/discount/tax/total math
(`common/utils/document-totals.util.ts`).
**Rule:** Never duplicate this calculation inline in a service.

### ADR-009
**Decision:** Every entity uses the same audit/status-history pattern.
**Reason:** Consistency and a single rendering path
(`StatusTimeline`) rather than per-entity bespoke history logic.
**Rule:** Never invent a second audit implementation.

### ADR-010
**Decision:** Shared UI components are always extended, never copied.
**Components:** `StatusBadge`, `StatusTimeline`, `ConfirmDialog`,
`DocumentEmailSection`, `SettingsSectionShell`.
**Known exception to fix, not a precedent to follow:** Invoice Void
currently uses the browser's native `confirm()` instead of
`ConfirmDialog` (see Section 7, Low). This is a gap to close, not a
second pattern to treat as valid.

---

## Do Not Re-Audit Unless Explicitly Asked

Verified present and functioning as of this document's last update:

✔ RLS (policies present, `withTenantContext` is the sole entry point)
✔ Tenant Context (`AsyncLocalStorage`-based, verified in source)
✔ Permission Matrix (backend guards + `PermissionGate` UI convenience)
✔ Docker (multi-stage Dockerfile, OpenSSL fix applied)
✔ CI Pipeline (`.github/workflows/ci.yml` present)
✔ Health Checks (`backend/src/health/` — real DB/Redis connectivity check)
✔ Security Headers (`helmet()` applied in `main.ts`)
✔ Validation (NestJS ValidationPipe, whitelist + forbidNonWhitelisted)
✔ PDF Generation (invoice PDF generation path, live and tested)
✔ Payments Architecture (success-path Stripe + manual recording)
✔ Scheduling Architecture (Appointments-backbone model, see ADR-002)
✔ Service Catalog (backs Estimates pricing/validation)
✔ Reports (dedicated backend module, real DTOs/services)
✔ Settings (unified shell + dynamic section routing)
✔ Automation Engine (cron-driven, real SMS/email, now has a settings UI)

Assume these are correct unless a change directly touches them. Do not
re-derive or re-verify these from scratch on a routine basis — that's
exactly the token cost this document exists to avoid.

**Not on this list on purpose** (genuinely unverified or incomplete —
see Section 7): Stripe failed-payment handling, AI Receptionist live-call
behavior, Customer Portal frontend completeness, the duplicate
convert-to-job path in ADR-007.

---

## 12. Session Handoff

**What was just completed:** `PROJECT_CONTEXT.md` created for the first
time, grounded directly in the current GitHub repo (backend modules,
frontend routes, migrations through `027`, shared components/utilities).

**What was verified:** Repo structure read directly from source
(`backend/src`, `frontend/app`, `frontend/components`,
`backend/prisma/migrations`, `docs/`) — this document reflects real code,
not assumptions.

**What remains:** Nothing in progress — this is a documentation
checkpoint, not mid-module work.

**What should be built next:** Per the solo-owner workflow audit and
Section 8: auto-assign-to-self for Jobs/Scheduling is the top-ranked
next improvement.

**Architectural warnings:** None new. Standing warnings carried into
Section 9 (raw SQL casts, additive migrations, RLS-only tenant access)
remain the load-bearing rules for this codebase.
