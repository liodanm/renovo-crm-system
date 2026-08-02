# PROJECT_CONTEXT.md

**CRM Version:** v0.26.0 *(note: `backend/package.json` reports
`0.1.0-rc.1` — discovered during audit; drift not resolved, not in scope)*
**Last Updated:** 2026-07-25
**Current Phase:** Production Hardening (bug-fix/audit pass, not new features)
**Status:** Production Ready
**Last Completed Module:** Production hardening pass — Estimate module
audit/fixes, Invoice Void payment-consistency fix, Stripe failed-payment
handling, scheduling conflict detection, Completion Flow mobile
improvement, appointment cancellation + audit history, repository
integrity CI checks (see Section 16)
**Next Module:** Undecided — audit-driven, not a fixed roadmap. A3
(auth/session redesign) explicitly deferred until multi-user SaaS
preparation begins — see Section 7 and Section 16.

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
invoices; Stripe webhook handles both `payment_intent.succeeded` and
`payment_intent.payment_failed` (migration `029`; failed attempts are
recorded as a real `payments` row with `status='failed'` — that value
already existed in the table's own CHECK constraint, unused until now —
plus a `payment_status_history` entry and a `payment_failed` automation
event; never touches `invoices.amount_paid`/`status`). Webhook invoice
lookups are explicitly scoped by `companyId` (carried in the
PaymentIntent's own metadata, set server-side at creation) rather than
querying across tenants. **Invoice Void** now blocks voiding an invoice
that still has active (`succeeded`/`partially_refunded`) payments
attached — see Section 5 and ADR-010; the browser's native `confirm()`
is still used for the confirmation itself (Section 7, Low — unchanged).

**Scheduling:** `scheduling/` module — calendar-backed appointment
scheduling with technician assignment. Assignment concept assumes
multi-tech; for the current solo-owner priority, simplifying/removing
the technician picker is still an open item (Section 7). Now has real
technician double-booking prevention (`assertNoTechnicianConflict` in
`scheduling.service.ts`, shared by `scheduleJob`/`reschedule`/
`updateAssignment`) — same technician + overlapping time is blocked;
`cancelled`/`completed`/`no_show` appointments never count as active.
Appointments can now be cancelled with a reason (`cancel()`) without
being deleted — status flips to `cancelled`, a
`appointment_status_history` row is written (migration `030`, mirroring
`job_status_history`/`payment_status_history`'s exact shape — appointments
were the one entity missing this pattern, per ADR-009), and a job that
was only `scheduled` because of that appointment reverts to `draft`,
identical to `unschedule()`'s existing job-side-effect. A completed
appointment or a job that's already `completed` can never be cancelled —
explicit guard, not incidental.

---

## 3. Production Modules

| Module | Status | Production-Ready | Key Architectural Decisions | Shared Components/Services Used |
|---|---|---|---|---|
| Authentication | Complete | Yes | JWT access/refresh; optional OAuth degrades gracefully; company invites | `auth/` guards, `TenantContextInterceptor` |
| Customers | Complete | Yes | Duplicate detection/merge, CSV import/export, presigned S3 uploads | `StorageService`, `customer-table.tsx`, `import-csv-modal.tsx` |
| Estimates | Complete | Yes | Server-computed totals; service-specific validated detail fields; one-click convert-to-job; `validUntil` now settable (DTO/service/form/detail page) — closes the previously-dead Estimate Expiration Workflow automation (migration `027` rule types can now actually fire, since nothing wrote this column before); discount-value reconstruction and partial-update discount/tax preservation bugs fixed (Section 5) | `computeDocumentTotals`, `EstimateForm.tsx`, `ActionBar.tsx`, `StatusTimeline.tsx` |
| Jobs | Complete | Yes | One-click generate-invoice-from-job; completion flow with photos/signature; Photos/Chemicals/Equipment now embedded inline in the Complete panel (accordion) instead of jump-links away from it | `CompletionFlow.tsx`, `PhotoSection.tsx`, `SignaturePad.tsx`, `ChemicalSection.tsx`, `EquipmentSection.tsx` |
| Scheduling | Complete | Yes (multi-tech assumption not yet simplified for solo use) | Technician-assignment model built for crews; technician double-booking now blocked (`assertNoTechnicianConflict`); appointments can be cancelled with a reason, preserving history (`appointment_status_history`, migration `030`) instead of being deleted | `AppointmentDetailPanel.tsx`, `ConfirmDialog` |
| Invoices | Complete | Yes | Server-computed totals; PDF + email send; email history tracking; Void now blocked when active payments exist (Section 5) | `computeDocumentTotals`, `DocumentEmailSection.tsx`, `email-log.service.ts` |
| Payments | Complete | Yes | Manual payment recording + Stripe webhook for both success and failure (`payment_intent.payment_failed`, migration `029`); webhook invoice lookups explicitly scoped by companyId | `PaymentsSection.tsx` |
| Reports | Complete | Yes | Dedicated services/DTOs, real backend | — |
| Service Catalog | Complete | Yes | Backs Estimates' per-service pricing/validation | — |
| Settings | Partial | Yes for built sections; several sections UI-only | Unified shell + dynamic section routing; Integrations page added (migration-free, all provider secrets remain Railway env vars) | `SettingsSectionShell.tsx`, `IntegrationsService`, `SystemHealthService` |
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
Purpose: the app's real confirmation dialog. **Known gap, still open:**
Invoice Void still uses the browser's native `confirm()` instead of this
— flagged in Section 7, not yet fixed. (A *separate*, already-fixed issue:
voiding an invoice with active payments is now blocked server-side and
the button is hidden for `partial`-status invoices — that's a payment-
consistency fix, not the `confirm()`-vs-`ConfirmDialog` gap itself.) Newly
adopted by Scheduling's Cancel Appointment action
(`AppointmentDetailPanel.tsx`) — note when nesting it inside a component
that has its own click-outside-to-close backdrop (like a slide-over
panel): render `ConfirmDialog` as a sibling, not a child, or a click on
its own backdrop bubbles up and closes the parent panel underneath it.

**`DocumentEmailSection`** (`frontend/components/documents/DocumentEmailSection.tsx`)
Purpose: shared "send this document by email + history" UI, used by
Invoices; designed to be reusable if Estimates ever needs the same UI.

**`IntegrationStatusService`** (`backend/src/common/integrations/integration-status.service.ts`)
Purpose: the single source of truth for "is provider X configured" —
checks Railway env vars only, never touches Postgres. Covers stripe,
postmark, twilio, s3, anthropic. `main.ts` boot logging and the
Settings > Integrations page both read this; there is no second list.
Extend by: adding a new provider definition to the one array here.

**`IntegrationsService`** (`backend/src/settings/services/integrations.service.ts`)
Purpose: backs the single consolidated Settings > Integrations page —
provider cards, system health, and business links (Google Review URL +
socials). Delegates every real connectivity check to the service that
already owns that provider (`MailService`, `SmsService`,
`StorageService`, `AiSuggestionsService`, `StripePaymentService`) rather
than calling any provider API directly. Persists only non-secret
operational metadata (last verify/test result + timestamp) in
`companies.settings.integrationHealth`; business links live in
`companies.settings.integrations` (`{googleReviewUrl, website, facebook,
instagram}`) — same `jsonb_set`-merge pattern as `branding`. **No
provider secret is ever stored in Postgres** — Railway env vars remain
the only source for Stripe/Postmark/Twilio/S3/Anthropic credentials;
see ADR-011. Extend by: adding a new provider case to
`verifyProvider`/`testProvider`, not a parallel integrations system.

**`SystemHealthService`** (`backend/src/health/system-health.service.ts`)
Purpose: the one place DB/Redis reachability is checked (`SELECT 1` /
`PING`). Both `/health` (`HealthController`) and Settings > Integrations
call this — extracted specifically so those two didn't end up with two
copies of the same check.

**`SettingsSectionShell`** (`frontend/components/settings/SettingsSectionShell.tsx`)
Purpose: the one settings-page layout. Every settings section (Company,
Branding, Automation, Integrations, etc.) renders inside this shell via
the dynamic `[section]` route — new settings pages should extend this,
not build a standalone page.

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
  document type (estimates/jobs/invoices/payments/**appointments**) and
  rendered through the shared `StatusTimeline` component rather than a
  single global audit table. `appointment_status_history` (migration
  `030`) was the missing sibling — appointments were the one entity
  without this pattern until now; same shape as
  `payment_status_history`/`job_status_history`.
- **appointments.cancellation_reason** (migration `030`, nullable text):
  set by `SchedulingService.cancel()`. The appointment row is never
  deleted on cancellation (unlike `unschedule()`, which still deletes) —
  status flips to `cancelled` and the row (plus its history) is
  preserved.
- **payments.status = 'failed'**: this value already existed in the
  table's own CHECK constraint before it was ever used — Stripe's
  `payment_intent.payment_failed` webhook (migration `029`) now actually
  writes it. Never affects `invoices.amount_paid`/`status` — a failed
  attempt collected $0.
- **estimates.validUntil**: pre-existing column, now actually settable
  (`CreateEstimateDto`/`UpdateEstimateDto`, `EstimateForm.tsx`). Read by
  `AutomationService`'s expiration-reminder/auto-expire rules (migration
  `027`) and the PDF/email/portal templates, all of which existed and
  expected this before anything ever wrote to it — the whole Estimate
  Expiration Workflow was dead code until this fix.
- **Invoice Void payment guard**: `InvoicesService.void()` now blocks
  voiding an invoice with any `payments` row in `succeeded` or
  `partially_refunded` status — prevents an invoice from silently
  disagreeing with its own payment history. Existing payments are never
  reversed/deleted by this check; staff must refund or void the payment
  itself first (both already-existing actions), then void the invoice.
- **Scheduling conflict detection**: no schema change — pure query-time
  validation (`assertNoTechnicianConflict`) checking for another
  `scheduled`/`confirmed` appointment on the same
  `assigned_to_company_user_id` with an overlapping time range.

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
- Scheduling/Jobs assume multi-technician assignment; no solo-owner
  auto-assign-to-self shortcut exists yet, adding an unnecessary click on
  every job. (Double-booking prevention was added this pass — a
  different, narrower fix; the picker itself is unchanged.)
- **A3, explicitly deferred by product decision, not forgotten:** the
  30-day `renovo_session` marker cookie vs. tab-scoped refresh-token
  storage design mismatch (Section 2, Authentication). A prior session
  fixed the acute symptom (a stale session landing on a permanently
  broken page now correctly redirects to `/login`), but the underlying
  question — what a "logged in for 30 days" experience should actually
  mean given tab-scoped token storage — remains open. **Do not touch
  auth/session behavior further until multi-user SaaS preparation
  begins; this is a stated product decision, not an oversight.**
- AI Receptionist backend is untested against a live call. Its
  *connectivity* (ANTHROPIC_API_KEY) now has a home on Settings >
  Integrations, but its *behavior* settings (greeting, FAQ, business
  hours — `UpdateReceptionistSettingsDto` already exists backend-side)
  still has no frontend page.
- No automated test coverage for the new Integrations verify/test
  methods (`SmsService.verifyConnection`, `MailService.verifyConnection`,
  `StripePaymentService.verifyConnection`, `StorageService.verifyConnection`
  / `testUploadRoundTrip`, `AiSuggestionsService.testConnection`) — these
  are thin wrappers around live provider HTTP calls, consistent with the
  rest of this codebase's test coverage.
- From the solo-owner workflow audit (Section 16), not yet acted on:
  automation (follow-ups/reminders) is invisible until a message is
  already sent — nothing on a customer/job/invoice page shows a pending
  automated action or lets staff cancel one before it fires; no
  "duplicate this estimate" shortcut surfaced on the estimate page
  itself (the capability exists, just isn't discoverable there).

**Low**
- Invoice Void uses the browser's native `confirm()` instead of the
  shared `ConfirmDialog` component. (Unchanged by this pass — a payment-
  consistency guard was added around void logic, but this specific
  UI-component gap is still open.)
- Customer Portal frontend status is unconfirmed — backend is real and
  tested, but frontend completeness hasn't been directly verified in
  this context.
- Calendar drag-and-drop reschedule is desktop-only by the component's
  own design; the Reschedule modal already works as a mobile fallback.

---

## 8. Future Roadmap

**Just shipped (this pass — see Section 16 for full detail)**
- Estimate module fixes: `validUntil` write path (unblocks the Estimate
  Expiration Workflow automation), discount-value reconstruction bug,
  partial-update discount/tax preservation bug.
- Invoice Void payment-consistency guard.
- Stripe `payment_intent.payment_failed` handling + webhook tenant-
  scoping fix (migration `029`).
- Scheduling technician double-booking prevention.
- Completion Flow: Photos/Chemicals/Equipment embedded inline instead of
  jump-links.
- Appointment cancellation with reason + `appointment_status_history`
  (migration `030`).
- Repository integrity: removed a stray duplicate source tree
  (`quote-widget-complete/`), regenerated `init-scripts/` (was 21
  migrations behind), added CI checks (`scripts/check-migration-sync.sh`,
  `scripts/check-duplicate-source.sh`) so both classes of drift are now
  caught automatically on every PR.

**Explicitly deferred (product decision, not an oversight)**
- A3 — auth/session-lifetime redesign. Do not pick this up until
  multi-user SaaS preparation begins.

**Approved specification, ready to build whenever picked up — not started**
- Job Archive System (not "Job Delete" — see ADR-013 and Section 17 for
  the full approved architecture, screen-by-screen business rules, and
  UI/UX requirements). This is a real, deliberated specification, not a
  placeholder — implement against Section 17 directly rather than
  re-auditing or re-deciding any of it.

**Next**
- Solo-owner auto-assign (remove/simplify the technician picker for
  single-operator accounts) — still the highest daily-friction item from
  the solo-owner workflow audit; not yet done (conflict detection this
  pass was a different, narrower fix).
- Surface a "duplicate this estimate" shortcut on the estimate detail
  page itself (capability already exists via `duplicate()`).
- Make pending automation actions visible somewhere near the customer/
  job/invoice, not just discoverable after the fact in the automation
  log.
- Decide where AI Receptionist's *behavior* settings (greeting, FAQ,
  business hours) get a frontend home.

**Later**
- On-site/mobile payment collection flow surfaced directly from the
  Job/Invoice screen (payment link or prominent "mark paid").
- Confirm and, if needed, build out the Customer Portal frontend.
- Invoice Void: replace native `confirm()` with `ConfirmDialog` (Section
  7, Low — still open).
- Estimate line items: allow deleting the last remaining line item
  (currently `canRemove={lineItems.length > 1}` blocks it — deliberately
  left alone for now, revisit only if daily use actually makes it
  annoying, not on a schedule).
- Estimate empty state (`EstimateForm.tsx`'s zero-line-items view):
  softer copy and a small icon (wrench/clipboard/toolbox) — cosmetic
  only, not urgent.

**Someday**
- Leads module (only becomes valuable once call/inquiry volume exceeds
  what going straight into Customers can handle).
- Users & Roles, multi-tech features generally — deferred until there
  are actual employees.
- AI Receptionist live-call validation.
- Real integrations for the "Coming Soon" cards on the Integrations
  page: Roof Measurement Provider, Google Maps, QuickBooks, Zapier,
  Google Calendar, Outlook, CompanyCam — currently disabled placeholders
  only, no backend for any of them.

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
second pattern to treat as valid. (A separate payment-consistency guard
was added around void logic this pass — it does not touch this gap.)
`ConfirmDialog` was correctly extended, not copied, for Scheduling's
Cancel Appointment action — see Section 4 for the one thing to watch
when nesting it inside a component with its own click-outside-to-close
backdrop.

### ADR-011
**Decision:** No integration provider secret (Stripe, Postmark, Twilio,
AWS S3, Anthropic) is ever stored in Postgres. Railway environment
variables remain the single, global source of truth for all of them.
**Reason:** This was already the implicit pattern (see `settings.dto.ts`,
migration `024`'s comments) before Settings > Integrations existed;
that page made it explicit rather than changing it. Storing per-tenant
credentials in the database would require real encryption-at-rest, key
management, and a resolution order (DB-vs-env) touching five modules —
a genuine architecture change (per-tenant bring-your-own-keys / true
multi-tenant SaaS), not something to introduce silently while building
a status/health page.
**What Settings > Integrations DOES persist:** only non-secret
operational metadata — last verify/test result and timestamp per
provider, in `companies.settings.integrationHealth` — and genuinely
public business links (Google Review URL, website, socials) in
`companies.settings.integrations`. Neither is a credential.
**Rule:** If per-tenant bring-your-own-keys is ever wanted, that is a
new decision to make explicitly (encryption utility, `integration_credentials`
table, env-fallback resolution in `SmsService`/`MailService`/
`StorageService`/`StripePaymentService`/the three Anthropic call sites) —
not an incremental addition to the current Integrations page.

### ADR-012
**Decision:** Repository integrity is enforced by CI, not by convention
alone.
**Reason:** A stray, fully-unwired duplicate source tree
(`quote-widget-complete/`, a leftover delivery bundle from an earlier
session) sat committed in the repo undetected, and `init-scripts/` (the
flat migration set Docker's Postgres init reads) silently drifted 21
migrations behind `backend/prisma/migrations/` — built once, at 6
migrations, never updated as the project grew to 28+. Both were only
found by manual audit, not by any automated check.
**What was added:** `scripts/check-duplicate-source.sh` (flags any
top-level directory outside the known layout, and any file whose
content is duplicated under a different top-level directory —
`init-scripts/` is deliberately excluded, since mirroring migrations is
its actual job) and `scripts/check-migration-sync.sh` (fails if
`init-scripts/` doesn't exactly mirror `backend/prisma/migrations/` +
`renovo_crm_schema.sql` + `backend/prisma/seed.sql`, including seed-file
ordering). Both run as a `repo-integrity` CI job, before `backend`/
`frontend`, on every PR.
**Rule:** Any new top-level directory needs an explicit addition to
`ALLOWED_TOP_LEVEL_DIRS` in the same PR that introduces it — an
unexplained new directory is exactly the failure mode this exists to
catch. Any new migration must be copied into `init-scripts/` in the same
PR (verified, not assumed — proven twice this pass by intentionally
reintroducing both failure modes and confirming CI caught them before
fixing them).

### ADR-013
**Decision:** Jobs get an Archive system, not a Delete/soft-delete
system — and Archive is modeled as its own independent business state
(`archivedAt`/`archivedBy`/`archiveReason`), not as a reuse of the
existing `status` column and not as a blanket "exclude everywhere"
filter copied from Customer's `deletedAt` pattern.
**Reason:** A full audit (screen-by-screen, query-by-query, not assumed)
found that `reports.service.ts` filters multiple queries on
`status = 'completed'` for revenue, completion-trend, average duration,
labor hours, and customer analytics. Reusing `status` for archiving
(e.g. `status = 'archived'`) would silently remove a completed job's
financial contribution from every one of those reports the moment it's
archived — the exact opposite of the goal. Copying Customer's `deletedAt`
pattern (excluded from literally every query, no exceptions) has the
same failure mode under a different name. A job can be simultaneously
`status = 'completed'` AND archived — those are two independent facts,
and the schema needs to represent them independently for reports to
stay correct.
**Full policy, including the complete screen-by-screen classification
table, is documented in Section 17 — treat that as a product
requirement for implementation, not something to re-derive.**
**Rule:** Never let "archived" and "status" collapse into the same
concept again in this codebase. Any new screen that reads jobs must be
classified against Section 17's table (Operational / Historical /
Customer-facing) before being built, not assumed.

---

## Do Not Re-Audit Unless Explicitly Asked

Verified present and functioning as of this document's last update:

✔ RLS (policies present, `withTenantContext` is the sole entry point)
✔ Tenant Context (`AsyncLocalStorage`-based, verified in source)
✔ Permission Matrix (backend guards + `PermissionGate` UI convenience)
✔ Docker (multi-stage Dockerfile, OpenSSL fix applied)
✔ CI Pipeline (`.github/workflows/ci.yml` present)
✔ Health Checks (`backend/src/health/` + `SystemHealthService` — real DB/Redis connectivity check, shared with Settings > Integrations)
✔ Security Headers (`helmet()` applied in `main.ts`)
✔ Validation (NestJS ValidationPipe, whitelist + forbidNonWhitelisted)
✔ PDF Generation (invoice PDF generation path, live and tested)
✔ Payments Architecture (success-path Stripe + manual recording)
✔ Scheduling Architecture (Appointments-backbone model, see ADR-002)
✔ Service Catalog (backs Estimates pricing/validation)
✔ Reports (dedicated backend module, real DTOs/services)
✔ Settings (unified shell + dynamic section routing)
✔ Settings > Integrations (provider cards + System Health + Business
  Links; real verify/test actions confirmed via `tsc`, `next build`, and
  existing backend test suite — see Section 12 for what wasn't
  live-tested against real provider accounts)
✔ Automation Engine (cron-driven, real SMS/email, now has a settings UI)
✔ Repository integrity (no stray duplicate source trees; `init-scripts/`
  verified in sync with `backend/prisma/migrations/`; both enforced by
  the `repo-integrity` CI job — ADR-012)
✔ Estimate Expiration Workflow (migration `027`'s automation rules can
  now actually fire — `validUntil` has a real write path as of this pass)
✔ Stripe failed-payment handling (migration `029`; webhook tenant
  scoping fixed alongside it)
✔ Invoice Void payment-consistency guard (does not touch the still-open
  native-`confirm()` gap, Section 7)
✔ Scheduling conflict detection (technician double-booking blocked;
  cancelled/completed/no-show appointments correctly never block)
✔ Appointment cancellation + audit history (`appointment_status_history`,
  migration `030`)

Assume these are correct unless a change directly touches them. Do not
re-derive or re-verify these from scratch on a routine basis — that's
exactly the token cost this document exists to avoid.

**Not on this list on purpose** (genuinely unverified or incomplete —
see Section 7): AI Receptionist live-call behavior, AI Receptionist
*behavior* settings (greeting/FAQ/hours — no frontend page), Customer
Portal frontend completeness, the duplicate convert-to-job path in
ADR-007, live-account verification of the Integrations verify/test
buttons (confirmed to compile and call the correct real endpoints; not
confirmed against actual Stripe/Twilio/Postmark/AWS/Anthropic accounts),
the A3 auth/session-lifetime redesign (explicitly deferred, not
attempted), solo-owner auto-assign-to-self (not built — conflict
detection this pass was a narrower, different fix), and the remaining
solo-owner workflow audit findings not yet acted on (automation
visibility, duplicate-estimate shortcut, desktop-only calendar drag —
see Section 16).

---

## 12. Session Handoff

**What was just completed:** Settings > Integrations — a single
consolidated page (System Health dashboard, provider cards for
Stripe/Postmark/Twilio/Anthropic/S3 with real Verify Connection and Test
actions, Business Links form, Coming Soon placeholders for Roof
Measurement/Google Maps/QuickBooks/Zapier/Google Calendar/Outlook/
CompanyCam). Fully additive: zero new database migrations, zero new
credential storage, zero duplicate settings systems. Closed a real bug
found during audit: `companies.google_review_url` had a read path
(customer receipt page) but no write path anywhere — it's now sourced
from the writable `companies.settings.integrations` jsonb instead (see
ADR-011). Removed the redundant `ai-assistant` nav stub since Anthropic
connectivity now lives on the Integrations page (its behavior-settings
gap is unchanged, just no longer flagged in nav — see Section 8).

**What was verified:** Backend `tsc --noEmit` clean on every file this
session touched (5 pre-existing, unrelated errors remain in
`customers.service.ts`/`custom-fields.service.ts` — caused by
`prisma generate` being blocked in this environment by a network
allowlist that doesn't include `binaries.prisma.sh`, not by anything in
this change). Full backend test suite still passes (38/38, no
regressions). Frontend `tsc --noEmit` clean. Real `next build` production
build succeeds, including the new `/settings/integrations` route. Git
diff confirmed additive-only: 14 modified files, 6 new files, zero
migration files touched, zero lockfile drift.

**What remains:** Live verification of the new Verify/Test buttons
against real Stripe/Twilio/Postmark/AWS/Anthropic accounts — not
possible in this environment (no credentials, no network access to
those providers). AI Receptionist behavior settings still need a
frontend home (Section 8, Next).

**What should be built next:** Per the solo-owner workflow audit and
Section 8: auto-assign-to-self for Jobs/Scheduling is still the
top-ranked next improvement; Estimate Expiration Workflow remains queued
per this document's header.

**Architectural warnings:** ADR-011 is now the load-bearing rule for
anything touching integrations — no provider secret goes into Postgres
without an explicit, separate decision to reverse it (see ADR-011 for
what that would actually require). Standing warnings from Section 9
(raw SQL casts, additive migrations, RLS-only tenant access) remain
unchanged and were followed in this change (all new raw SQL in
`integrations.service.ts` casts `$1::uuid`; no schema changes at all).

---

## 13. Solo-Owner Productivity Phase (new — started 2026-07-23)

**Why this phase exists:** the CRM is feature-complete enough to run the
business day-to-day. From here, work is no longer "build the next
module" — it's audit-driven: find real daily friction for a single
owner-operator running the business from a phone in the field, fix the
highest-ROI items, repeat. Every change in this phase should answer
"will this save real time every day," not "does this look like a
complete enterprise CRM feature."

**Process:** audit a workflow end-to-end (real code, not assumptions) →
produce a ranked Friction List (severity, time wasted, frequency,
effort, ROI) → implement only the approved highest-ROI items → verify →
update this doc + the Friction List + the Product Improvement Score.

### Sprint 1 — shipped 2026-07-23

Eight items, all frontend-driven with two small backend aggregate-query
additions (no new endpoints, no schema changes):

1. **Payment amount auto-fill** — `PaymentsSection.tsx` now defaults the
   amount field to `balanceDue` when the Record Payment form opens;
   still fully editable. Frontend only.
2. **Dashboard "Today's Jobs" clickable** — each row now links to
   `/jobs/{id}`; was previously a dead end. Frontend only.
3. **Customer Profile "Money at a Glance"** — new card in the existing
   Overview tab: Balance Due, Open Estimates count, Open Invoices
   count, + a New Estimate button. Phone numbers are now `tel:` links.
   Backend: `CustomersService.getProfile()` extended with three cheap
   aggregate queries (`invoice.aggregate`, `estimate.count`,
   `invoice.count`) — no new table, no new endpoint.
4. **Jobs List Today/This Week/All filter** — defaults to Today, sorts
   by `scheduledStart`. Entirely client-side against the existing
   `jobsApi.list()` response; no new endpoint. Also fixed a real gap:
   the backend was already returning `scheduledStart` on this endpoint,
   but the frontend `JobListItem` type never declared it, so it was
   silently unusable — now typed and surfaced as a visible column.
5. **Job Detail field-ops sections gated by status** — Photos/
   Chemicals/Equipment now only render once a job has actually started
   (`status !== 'draft' && status !== 'scheduled'`); previously always
   visible, even on jobs with nothing to log yet.
6. **Complete Job quick links** — the Complete panel now has jump-links
   to the Photos/Chemicals/Equipment sections (anchored via `id`
   attributes added in #5's containers). Nothing moved or duplicated —
   pure navigation aid.
7. **Estimate creation customer prefill** — `/estimates/new?customerId=`
   now prefills the customer via a new `initialCustomerId` prop on
   `EstimateForm`, wired from the Customer Profile's New Estimate
   button (#3). Required a `Suspense` boundary around the
   `useSearchParams()` call — Next.js's static-export requirement, not
   optional; found via a real production build failure, not assumed.
8. **Customer Table columns** — added Balance Due and Last Service
   Date. Backend: `CustomersService.list()` now batches a `groupBy`
   aggregate for just the current page's customer IDs (not the whole
   table), so this stays cheap regardless of customer count.

**Verified:** backend `tsc --noEmit` clean (same 5 pre-existing,
unrelated Prisma-typing errors as prior sessions — see Section 12 for
why those exist in this sandbox); backend test suite 38/38 passing;
backend `npm run build` → `dist/main.js` lands at the correct path;
frontend `tsc --noEmit` clean; **the full `next build` initially
failed** on `/estimates/new` (`useSearchParams()` needs a `Suspense`
boundary for static prerendering) — found, fixed, rebuilt clean, all 33
routes generate successfully. This is exactly the kind of thing that
only a real build catches, not a type-checker — logged here so it isn't
re-discovered as a surprise later.

**Not yet done from this pass's audit (deferred, not forgotten):**
cancelling a job/appointment (no UI path exists at all — `cancelled` is
only ever a display label, never a reachable action; real effort,
needs a backend endpoint, correctly out of Sprint 1's scope); touch/
mobile drag-and-drop reschedule (`TimeGridView` is explicitly
desktop-first per its own code comment); global cross-module search;
service-catalog favorites/frequently-used sorting; consolidating
Chemicals/Equipment/Photos fully into the Complete panel rather than
just linking to them (#6 is the small version of this fix, not the
full one).

### Updated Product Improvement Score (post-Sprint-1)

| Category | Before | After |
|---|---|---|
| Mobile usability | 42 | 48 |
| Daily speed | 52 | 62 |
| Navigation | 48 | 50 |
| Scheduling workflow | 55 | 55 (untouched this sprint) |
| Estimating workflow | 55 | 62 |
| Job workflow | 65 | 70 |
| Payments workflow | 60 | 78 |
| Customer search/history | 40 | 68 |
| Service catalog | 55 | 55 (untouched this sprint) |
| Automation | 70 | 70 (untouched this sprint) |
| **Overall UX** | **~52** | **~61** |

## 14. Session Handoff (2026-07-23)

**What was just completed:** Solo Owner Productivity Sprint 1 — see
Section 13 for the full list. Scope was deliberately limited to the 8
approved items; no other module or refactor was touched.

**What was verified:** see "Verified" under Section 13. The
`/estimates/new` Suspense bug is the one finding worth remembering —
`tsc` and backend tests never catch missing-Suspense issues; only a
real `next build` does.

**What remains:** the "Not yet done" list under Section 13 is the
active backlog for Sprint 2, pending explicit approval — this phase is
audit-then-approve, not a standing roadmap.

**Architectural notes:** no schema changes, no new endpoints, no new
permissions in this sprint — every item extended an existing
component/query. `CustomersService.list()`'s per-page balance/
last-service aggregation is the one pattern worth reusing if similar
"summary column" needs come up elsewhere (batch by current page's IDs,
never the whole table).

### Sprint 2 — Customer Intake & Estimate Workflow (shipped 2026-07-23)

Frontend-only — zero backend changes, zero new endpoints, zero
migrations. Goal: shrink the phone-call-to-sent-estimate path.

1. **Inline customer creation inside New Estimate** — the plain
   customer `<select>` was replaced with a new `CustomerPicker`
   component (search box + filtered list). A "+ New Customer" option at
   the top opens the *existing* `CreateCustomerModal` unchanged; on
   save, the modal now forwards the created customer back (its
   `onCreated` callback was widened from `() => void` to
   `(customer: CustomerProfile) => void` — `customersApi.create()`
   already returned this, it just wasn't being passed through). The
   estimate form auto-selects the new customer and continues — no
   navigation, no reload, every already-typed line item stays intact.
2. **Quick Add is the same modal, not a second one** — audited first:
   `CreateCustomerModal` already only requires a first/business name;
   phone, email, and address were already optional. Building a
   separate "quick add" form would have been the exact duplicate
   component this sprint's rules forbid. The one real gap this exposed
   — a quick-added customer has zero properties, which the estimate
   form previously dead-ended on ("This customer has no properties
   yet.") — was closed by exporting the *existing* `AddPropertyForm`
   (previously private to `properties-tab.tsx`) and surfacing it inline
   the same way, with the same auto-select-and-continue behavior.
3. **Estimate list filter** — Needs Response (default) / Accepted /
   All, same client-side tab pattern as the Jobs Today/This Week/All
   filter from Sprint 1. No new endpoint; `estimatesApi.list()` was
   already sorted `createdAt: desc` server-side (verified, not
   assumed) — the "newest estimate buried" concern from the audit
   turned out not to hold up.
4. **Customer search + recency sort** — `CustomerPicker` searches
   name/phone/email/city (`primaryLocation` — the closest available
   proxy to a full address without a backend change; documented
   honestly as partial, not oversold). Default (non-searching) order is
   recently-used → recently-created → alphabetical. Recently-used is
   tracked via a new small localStorage helper
   (`lib/hooks/use-recent-customers.ts`) — capped at 20 IDs, never
   touches Postgres, exactly the "reuse existing timestamps or local
   state" instruction.
5. **Reduced clicks audit** — tax rate already prefilled from Business
   Defaults (pre-existing, confirmed working, left alone). Expiration
   date, payment terms, and "assigned salesperson" do not exist as
   fields anywhere in the Estimate model or form — not built, since
   inventing them would be exactly the kind of feature invention this
   sprint's rules prohibit; a single-owner business has no salesperson
   field to assign.
6. **Draft persistence** — new-estimate-only (never edit mode)
   localStorage autosave of the in-progress form, restored on next
   visit to `/estimates/new` unless an explicit `?customerId=` link is
   present (that intent wins over a stale draft). Cleared automatically
   the moment a save actually succeeds.

**New files:** `frontend/components/estimates/CustomerPicker.tsx` (the
one genuinely new component this sprint — nothing like it existed to
reuse), `frontend/lib/hooks/use-recent-customers.ts`.

**Extended, not duplicated:** `CreateCustomerModal`, `AddPropertyForm`
(exported from `properties-tab.tsx`, not copied), `EstimateForm`.

**Verified:** frontend `tsc --noEmit` clean; full `next build` — all 33
routes generate successfully including `/estimates/new` and
`/estimates`; backend untouched, re-ran its test suite anyway as a
sanity check (38/38 still passing, zero regressions since nothing on
that side changed).

**Known limitation, stated honestly:** "search by address" is currently
proxied through `primaryLocation` (city/state) on `CustomerSummary`,
since the full street address isn't part of that summary shape and
adding it would mean touching the backend query — deliberately not done
this sprint per the "no backend changes" instruction. If full-address
search turns out to matter in practice, that's a small, explicit future
addition, not a silent gap.

## 15. Instant Quote Widget (Phase 1 — shipped)

**What it is:** a public, unauthenticated entry point (`/public/:companySlug/quote-widget/*`)
that lets a homeowner get a real, priced estimate without calling —
selects services, enters manual measurements, gets an instant price, and
submits contact info. The result is a completely real `Estimate` row,
indistinguishable from one staff created by hand.

**Module:** `backend/src/public/quote-widget/` — deliberately its own
module, not folded into `leads/`. `LeadsService` remains lead-capture
only. Future work (roof measurement, coupons, analytics, AI) all lands
here, not in `leads/`.

**Hard architectural rule this module follows — never violate it:**
this module contains **zero** business logic of its own beyond
orchestration. Every real operation — customer lookup/creation, property
creation, pricing, estimate creation, email delivery, portal access — is
a call into the service that already owned it. If a future session finds
itself writing pricing math, a second customer-creation query, or a
second automation trigger inside this module, that's a bug, not a
feature — go back to the service that already does it instead.

**The one piece of genuinely new logic, and why it's necessary:**
`TenantContextInterceptor` only populates the ambient tenant context
(`AsyncLocalStorage`) when `request.user` or `request.portalCustomer` is
present — a `@Public()` route has neither. `EstimatesService.create()`'s
`assertCustomerAndPropertyBelongToCompany()` reads that ambient context
via `this.prisma.tenant.property.findFirst(...)` and throws if it's
unset. `QuoteWidgetService` manually wraps its call to
`EstimatesService.create()` (and the immediately-following `sendEmail()`)
in `TenantContextService.run({ companyId }, ...)` — the exact same thing
the interceptor already does for every authenticated request, just
invoked explicitly instead of automatically. This is the one place a
future extension of this module needs to think carefully: any new call
into a service that uses `this.prisma.tenant.*` internally needs the
same wrapper; any call into a service using `this.prisma.<model>.*`
(the base client, explicit `companyId` in every query — `CustomersService`,
`CustomerPropertiesService`, `PortalAuthService`, `ServiceCatalogService`
all already work this way) does not.

**Existing-customer handling:** `CustomersService.findOrCreateByEmail()`
(new, additive) — `create()` itself is completely unchanged and still
throws `ConflictException` on an exact-email match for every existing
staff call site. Only the widget's new method silently reuses an
existing customer instead. Property matching is a simple normalized
comparison (lowercased/trimmed `addressLine1` + exact `postalCode`) —
deliberately not a real address-standardization service, since none
exists anywhere in this codebase; documented as a known, honest
limitation, not hidden.

**Schema change:** one additive column, `estimates.source` (nullable
text, migration `028`), set to `'Website Instant Quote'` only by this
flow — every staff-created estimate stays `NULL`, unchanged.

**Two small, justified fixes made to existing code, not new patterns:**
`EmailLogService`'s `sentByUserId` and `EstimatesService.sendEmail()`'s
`userId` parameter were both TypeScript-required despite the underlying
DB column already being a nullable FK (`sent_by_user_id UUID REFERENCES
users(id)`, no `NOT NULL`) — a public quote has no staff user to
attribute the email to. Made both genuinely optional, end to end. Every
existing staff call site still always passes a real `userId` and is
completely unaffected.

**Explicitly deferred to Phase 2+ (per approved scope, not forgotten):**
roof measurement APIs, satellite imagery, AI measurement/upselling,
referral/coupon codes, Facebook/Google Ads integration, an analytics
dashboard, white-label custom domains, payment-during-quote,
scheduling-during-quote. The module structure has clean room for all of
these; none are built.

**Not yet built:** the actual embeddable widget frontend (the
`<script src="widget.js">` / `<renovo-quote-widget>` piece) — this
session shipped the backend orchestration and verified it end-to-end
against a real build; the standalone frontend bundle is separate,
scoped work.

### Hardening pass (shipped)

- **Idempotency:** `SubmitQuoteDto.idempotencyKey` (optional, client-generated)
  — checked against Redis (`quote-widget:idempotency:{slug}:{key}`, 24h
  TTL) before processing; a repeated key returns the cached result
  instead of creating a second estimate. Same Redis instance
  `PortalAuthService` already uses for magic links — no new store.
- **Structured logging:** every workflow event (`submission_received`,
  `customer_matched`/`created`, `property_matched`/`created`,
  `estimate_created`, `estimate_email_sent`, `portal_link_sent`,
  `submission_completed`, plus `honeypot_triggered`,
  `duplicate_submission_blocked`, `company_not_found` on the failure
  paths) — via the existing `Logger`, structured objects (not raw
  string interpolation), IDs only, no raw email/phone content logged.
- **Typed mappers:** `mappers/quote-widget.mappers.ts` — every `as any`
  cast from the first pass replaced with functions returning the real
  DTO classes (`CreateCustomerDto`, `CreatePropertyDto`,
  `CreateEstimateDto`, `CreateEstimateLineItemDto`).
- **E2E verification:** `backend/scripts/verify-quote-widget.js` — a
  real script hitting the actual deployed endpoints (branding, services,
  submit, idempotency retry, honeypot), plus a paired SQL query to
  confirm the created rows directly. **This sandbox has no
  Postgres/Docker access to run it** — it must be run by a human against
  the real deployment. Documented honestly rather than claimed as done.

## 16. Session Handoff (most recent — 2026-07-25)

**What this session was:** a production-hardening pass, not feature
work — repository integrity audit, a full Estimate module audit/fix
pass, then four ranked findings (A1–A4) from a broader 7-module audit,
approved and fixed one at a time, then a solo-owner workflow audit with
two findings acted on. A3 (auth/session redesign) was explicitly
deferred by product decision partway through — noted, not silently
dropped.

**Repository integrity (done first, before any bug fixes):**
- Found and removed `quote-widget-complete/quote-widget-complete/` — a
  fully unwired duplicate of ~16 files, proven byte-identical to their
  real counterparts via SHA-256 before deletion, and proven safe to
  delete by actually deleting it in an isolated copy and re-running the
  full build/test suite (identical results).
- Found `init-scripts/` (Docker's Postgres init source) was 21
  migrations behind `backend/prisma/migrations/` — built once at 6
  migrations, never updated since. Regenerated it from the real
  migration set; verified by applying all 30+ files against a genuinely
  fresh Postgres 16 instance (matching `docker-compose.yml`'s image
  version) with zero errors, then confirming all previously-missing
  tables (`service_catalog_items`, `invoices`, `payments`, etc.) exist.
- Added `scripts/check-duplicate-source.sh` and
  `scripts/check-migration-sync.sh`, wired into CI as a `repo-integrity`
  job — see ADR-012. Both were proven to actually catch their target
  failure mode by intentionally reintroducing it and confirming a
  non-zero exit code, not just written and assumed correct.

**Estimate module audit (full pass, not just the two findings below):**
found and fixed three real bugs: (1) `validUntil` had zero write path
anywhere despite automation/PDF/email/portal all already reading it —
the entire Estimate Expiration Workflow (migration `027`) was silently
dead code; (2) editing an existing percentage-discounted estimate showed
the dollar `discountAmount` in the percentage field and would silently
recompute a much larger discount on save (verified with concrete
numbers: a $50/10% discount became $250/50% on re-save); (3) any partial
`PATCH /estimates/:id` that omitted `discountValue`/`taxRatePercent`
would silently zero out an existing discount/tax rate. All three fixed
and verified with standalone before/after numeric proof.

**A1 — Invoice Void payment consistency:** `void()` now blocks when the
invoice has any `succeeded`/`partially_refunded` payment attached.
Existing payments are never touched — staff must refund/void the
payment first (both pre-existing actions). Verified against a real DB
across five invoice states (unpaid, partial, paid, void, and
"was-partial-now-refunded-back-to-sent").

**A2/A6 — Stripe failed-payment handling + webhook tenant scoping:**
`payment_intent.payment_failed` now records a real `payments` row
(`status='failed'`, that value already existed unused in the CHECK
constraint), a `payment_status_history` entry, and a `payment_failed`
automation event (migration `029` extends `automation_log.rule_type`,
following the exact 022/026/027 precedent). Webhook invoice lookups now
explicitly scope by `companyId` (added to PaymentIntent metadata at
creation) instead of querying across tenants. One necessary correctness
fix bundled in: the succeeded-path idempotency check is now
status-scoped too, so a failed attempt on a PaymentIntent can never
block recording its later successful retry — verified against a real DB
that this exact scenario works.

**A4 — Scheduling conflict detection:** `assertNoTechnicianConflict`
blocks same-technician overlapping appointments across
`scheduleJob`/`reschedule`/`updateAssignment`; cancelled/completed
appointments never block. Also fixed, because it would otherwise have
made the new validation invisible: `ScheduleJobModal`/`RescheduleModal`
were silently discarding real error messages in their catch blocks —
now surface `ApiError.message` like every other form in this app
already does. Verified against a real DB across all required scenarios
(overlapping, adjacent, different technicians, self-exclusion on
update, cancelled/completed never blocking).

**Completion Flow mobile improvement:** Photos/Chemicals/Equipment now
render inline inside the Complete Job panel as a one-at-a-time
accordion, instead of jump-links that scrolled a tech away from the
form and back. The standalone sections elsewhere on the job page are
hidden while the panel is open (same SWR cache key either way, so
nothing goes stale). Zero changes to the three field-ops components
themselves, or to completion/signature validation.

**Appointment cancellation (from the solo-owner workflow audit's #1
finding):** `cancel()` — status to `cancelled` (row preserved, unlike
`unschedule()` which still deletes), reason captured, audit history
written, linked job reverted to `draft` if it was only `scheduled`.
Blocked outright for an already-completed appointment or a completed
job. UI: `AppointmentDetailPanel.tsx` gained a Cancel action reusing
`ConfirmDialog` — see Section 4 for the sibling-not-child nesting note
that came out of building this.

**Solo-owner workflow audit:** full Lead→Estimate→...→Follow-up review
performed; two findings (Completion Flow, appointment cancellation)
acted on this pass. Remaining findings — automation invisibility, no
duplicate-estimate shortcut, desktop-only calendar drag — are in
Section 7/8, not yet built.

**What was verified, every fix:** backend `tsc --noEmit` (same 5
pre-existing, environment-caused Prisma-generation errors throughout,
zero new ones introduced by any change this session), backend
`npm test` (38/38 passing after every single fix), frontend `tsc
--noEmit` clean, frontend `next build` succeeding. Every migration
(`029`, `030`) verified by actually applying it to a genuinely fresh
Postgres 16 instance, not just reviewed. Every backend logic fix
verified against real rows in that same database, not simulated.
`init-scripts/` kept in sync with every new migration, confirmed by the
new CI check passing after each one. File-scope confirmed by mtime
after every change — nothing outside the stated scope of each approved
fix was ever touched.

**What remains:** everything in Section 7 Medium/Low that isn't marked
fixed above, plus the deferred A3 work (do not start without an explicit
instruction that multi-user SaaS prep has begun).

**Architectural warnings:** ADR-012 (repo-integrity CI) and ADR-009
(appointments now correctly follow the shared audit-history pattern) are
the two new load-bearing rules from this pass. Every other standing
warning from Section 9 was followed throughout (additive migrations
only — confirmed both `029` and `030` are pure `ALTER`/`CREATE IF NOT
EXISTS`; raw SQL casts present in all new queries; RLS-only tenant
access maintained, including the webhook path's explicit `companyId`
scoping which is the correct pattern for `@Public()`-adjacent code per
Section 15, not an RLS bypass).

## 17. Job Archive Policy (approved specification — not yet implemented)

**Status: approved architecture and business rules, zero code written.**
Do not build a "Delete Job" feature under any name — this policy exists
specifically because that was the wrong model. Treat everything below
as a product requirement to implement against, not a starting point to
re-derive or reinterpret. See ADR-013 for the core reasoning.

### Why this exists
Jobs are business records, not disposable rows. A completed job that's
been invoiced and paid has already contributed to real financial
history — deleting it (soft or hard) would make that history lie later.
The fix is to stop conflating "should this still count in reports and
history" with "should this show up in today's active work," which is
what a single delete/soft-delete flag would otherwise force together.

### Schema
Two independent facts about a job, both real, both tracked separately:
- `status` — draft/scheduled/in_progress/paused/completed/cancelled/on_hold. Unchanged by archiving. Always reflects what actually happened to the work itself.
- `archivedAt` (nullable timestamp), `archivedBy` (user id), `archiveReason` — a new, independent business state. A job can be `status = 'completed'` AND archived at the same time; that's not a contradiction, that's the whole point.

**`archiveReason`** — predefined list with an optional free-text note,
not free text alone (so historical reasons stay queryable/reportable):
Duplicate job · Created by mistake · Test record · Imported incorrectly
· Customer requested removal · Other (with note).

### Screen-by-screen business rules — the full specification

**Operational views (hide archived jobs):**
| Screen | File |
|---|---|
| Jobs List | `jobs.service.ts` → `findAll()` |
| Scheduling / Calendar page | `scheduling.service.ts` |
| Dashboard — Today's Jobs | `dashboard.service.ts` → `getTodaysJobs()` |
| Dashboard — job stat counts | `dashboard.service.ts` → `getSummary()` |
| Dashboard — Job Calendar widget | `dashboard.service.ts` → `getCalendar()` |
| Dashboard — Customer Map "last job" indicator | `dashboard.service.ts` → `getMapData()` (nuance: skip to the next-most-recent *non-archived* job, don't just show nothing) |
| Automations (review requests, thank-yous, recurring reminders) | `automation.service.ts` |
| AI Receptionist | `receptionist-tools.service.ts` (should fail gracefully on an archived job's id, not silently operate on it — no human in the loop when this runs) |
| Customer Portal (customer-facing service history) | `portal-data.service.ts` → `getServiceHistory()` — **this is a separate method from the staff-facing one below; do not confuse them.** Decided: customers should not see archived jobs. A customer doesn't know a job was archived because it was a test entry, duplicate, or mistake, and would reasonably ask why a "$0 Roof Cleaning" or "Test Job" is on their history. Staff know the context; customers don't. |

**Historical/internal views (always show archived jobs):**
| Screen | File |
|---|---|
| Reports (revenue, completion trend, avg duration, labor hours, customer analytics) | `reports.service.ts` |
| Customer Detail — Service History tab (staff-facing) | `customers.service.ts` → `getServiceHistory()` — **not the portal one above** |
| Customer Detail — lifetime value / job counts | `customers.service.ts` (groupBy) |
| Invoices (existing invoice generated from a job) | `invoices.service.ts` |
| Invoice detail's "View Job →" link | `jobs.service.ts` → `findOne()` |
| Job Detail Page (viewing one job directly by id) | `jobs.service.ts` → `findOne()` |
| Payments | transitively via invoices |

Not applicable: "route planning" — confirmed no dedicated system exists;
GPS is only audit-trail metadata on chemical/equipment log entries.

### UI/UX requirements
- Never label the action "Delete" anywhere. Always "Archive Job."
- Deliberately not placed next to Complete Job or other frequent
  in-field actions — lives under a Job overflow menu / admin-style
  action area, since archiving is an administrative action a technician
  shouldn't be able to tap by accident mid-job.
- Confirmation dialog must state the actual behavior, not a generic
  warning:
  > Archive this job?
  > • It will be removed from active job lists, scheduling, dashboards, and automations.
  > • It will remain in invoices, reports, customer history, and financial records.
  > This action can be reversed later.

### What implementation still needs (not done yet)
Migration for `archivedAt`/`archivedBy`/`archiveReason` on `jobs`
(additive only, per Section 9's standing rule). Updates to exactly the
8 operational-view queries listed above — and *only* those; the 7
historical-view queries listed above get zero changes, verified by
reading their actual current query text, not assumed safe. An
un-archive path (the confirmation dialog promises "this can be reversed
later" — that promise needs a real implementation, not just the wording).

