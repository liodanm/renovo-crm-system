# PROJECT_CONTEXT.md

**CRM Version:** 0.1.0-rc.12 (per `package.json`; the informal `v0.26.0` used
previously did not correspond to any real version file and has been
retired — use the migration count or commit hash for precise state instead)
**Last Updated:** 2026-08-19
**Regenerated from:** direct inspection of `github.com/liodanm/renovo-crm-system`
at commit `f274921` (2026-08-18)
**Current Phase:** Production Hardening
**Status:** Production Ready (core workflow); several newer modules
partially built — see Section 3
**Last Completed Module (as of this audit):** Customer Portal Phase 2A
(Estimates: view/approve-with-signature/decline) + Invoice Customer
Portal workflow (view/pay/download)
**Next Module:** Undecided — see Section 8

> Purpose: let any future Claude session understand this codebase's current
> architecture without rediscovering it from scratch. This is not a
> changelog. It describes what exists today, not the history of how it
> got here.
>
> **This revision replaces a version last genuinely updated 2026-08-11**
> (commit `37edb7f`). ~57 commits landed between that point and this
> audit — see "What changed since the last version of this doc" below
> before trusting anything that sounds like old context.

---

## 0. What changed since the last version of this doc

The previous PROJECT_CONTEXT.md (dated 2026-08-11 in its own header,
2026-07-21 misleadingly) was stale against the real repo by the time this
session started. Corrections, in order of importance:

- **Stripe failed-payment webhook: DONE.** `payment_intent.payment_failed`
  is fully handled in `portal.controller.ts::handleStripeWebhook`, logged
  via the standard `logAutomationEvent()` path with `rule_type =
  'payment_failed'` (migration `029`). This was listed as an open Medium
  gap; it is closed. Section 7 in the old doc was wrong on this point.
- **Auto-assign-to-self: DONE.** `scheduling.service.ts` auto-assigns a
  job's first appointment to the scheduling user when no
  `assignedUserId` is given and no appointment exists yet for that job;
  reschedules of an already-assigned appointment are left alone. This
  was the old doc's top-ranked "Next" roadmap item; it's implemented.
- **Estimate Expiration Workflow: DONE.** Was listed as "Next Module" in
  the old doc; migration `027` plus corresponding automation/estimates/
  settings code is in place and referenced across
  `automation.service.ts`, `estimates.service.ts`, `settings.dto.ts`.
- **Customer Portal frontend: now partially built**, not "unconfirmed."
  Phase 2A shipped: Estimates (view, approve with signature capture,
  decline) and an Invoice view/pay/download flow, both with
  viewed-tracking. Several portal-specific bugs were found and fixed in
  this window (see Section 7) — treat the portal as real but young, not
  as fully hardened as Estimates/Jobs/Invoices in the staff app.
- **Leads: now has a real (if minimal) backend.** Not "not built" as the
  old doc said, and not a full Leads module either. There is one public,
  unauthenticated capture endpoint (`POST /public/:companySlug/leads`)
  that funnels directly into `CustomersService.findOrCreateByEmail` with
  `lead_status = 'lead'` — deliberately no separate Lead entity, no
  Leads UI. This mirrors the existing Properties pattern (Section 5) of
  avoiding a parallel system for something that's really a Customer
  state.
- **Several new backend modules exist that the old doc never mentioned:**
  `leads/`, `public/quote-widget/`, `ai/` (dashboard AI suggestions),
  `dashboard/`, `geocoding/`, `search/`, `sms/`, `weather/`,
  `admin-data/`. See Section 2.
- **Migrations now run automatically on Railway deploy.**
  `scripts/run-migrations.sh` is wired as a Railway pre-deploy command
  (per its own header comment — not independently verifiable from the
  repo alone, since Railway pre-deploy commands are dashboard
  configuration, not committed config). It tracks applied migrations in
  a real `schema_migrations` table and only runs new ones. **This
  changes, but does not eliminate, the standing "verify migrations
  actually ran" rule** — the script is real and idempotency-aware, but
  confirm the Railway dashboard's Pre-Deploy Command is actually set to
  call it before assuming any given migration applied itself.
- **Dark Mode shipped app-wide**, plus a Settings navigation redesign
  (card-grid landing page replacing the persistent sidebar) and several
  rounds of mobile-responsiveness fixes. Not mentioned anywhere in the
  old doc.
- **SaaS-facing branding**: company logo upload (server-validated) now
  flows into emails and the customer portal; per-tenant brand colors
  exist. Relevant if/when this becomes multi-tenant-sold, not just
  internal-use.
- **Manual payment recording got materially richer**: `tip_amount`,
  `processing_fee_amount` + `card_type` (Credit/Debit), Zelle as a
  payment method, and `invoice_id` on `payments` is now nullable
  (supports recording a payment against a customer with no invoice on
  file). See migrations `035`–`037`.
- **ADR-007 is still unresolved.** The manual `POST
  /estimates/:id/convert-to-job` endpoint is still live in
  `estimates.controller.ts` alongside auto-creation-on-accept. No
  decision has been made either way. Do not resolve this unilaterally.
- **Invoice Void still uses browser `confirm()`**, not the shared
  `ConfirmDialog` — confirmed still true by direct source check
  (`frontend/app/invoices/[id]/page.tsx`). Same gap also exists in
  `PaymentsSection.tsx` for voiding a payment. Both still open, Low
  priority, per the old doc.
- **AI Receptionist: still no settings UI, still untested live.**
  Confirmed unchanged — `receptionist/` has a real DTO
  (`receptionist-settings.dto.ts`) and backend services (Twilio
  signature verification, TwiML building, call summarization, business
  hours) but no corresponding frontend route exists anywhere in
  `frontend/app`.
- **`docs/PROJECT_STATUS.md`, `docs/ROADMAP.md`,
  `docs/V1_READINESS_AUDIT.md`, and `docs/full-system-audit.md` are all
  older than the old PROJECT_CONTEXT.md itself** (dated 2026-07-14 to
  2026-07-20) and describe an earlier, pre-Estimates/Jobs/Invoices-UI
  version of this project. **Do not treat anything in `docs/` as current
  without checking its last-commit date first** — this doc
  (PROJECT_CONTEXT.md) is the only document in the repo intended to be
  kept current, and even it drifts; always sanity-check against source
  for anything load-bearing.

---

## 1. Project Overview

Renovo CRM is a business-management system for pressure washing companies —
leads, customers, estimates, jobs, scheduling, invoicing, payments, and
customer communication in one place.

**Target users:** Solo owner-operators and small crews. The active
build/priority focus is currently a single-owner workflow (no employees) —
features that only make sense at multi-employee scale (user roles, crew
assignment) are built but intentionally de-prioritized for polish.
Auto-assign-to-self (Section 0) is the one exception: a real solo-owner
accommodation has now been built directly into the multi-tech-shaped
scheduling model, rather than waiting for a broader simplification.

**Current business workflow:** Lead capture (public, unauthenticated) →
becomes a Customer → Estimate → accepted → converted to a Job → scheduled
→ completed → converted to an Invoice → paid → (optional) review request
/ recurring-service reminder. See Section 6.

**Design philosophy:**
- Extend existing modules before adding new screens or parallel systems.
- Server computes anything financial (totals, tax, discounts) — never
  trust client-submitted numbers.
- Every tenant-scoped table is protected by Postgres Row-Level Security;
  application code never relies solely on `WHERE company_id = ...`
  discipline.
- Real integrations degrade gracefully when unconfigured (Twilio,
  Postmark, Stripe, AWS) — they log their own state at boot rather than
  failing silently later. The same "no key, no cost, graceful skip"
  philosophy now also covers Weather (Open-Meteo, no key) and Geocoding
  (OpenStreetMap Nominatim, no key) — deliberately not Google Maps/a
  keyed provider, since these support the product rather than being it.
- Company-scoped for future SaaS resale, but no multi-tenant *management*
  UI exists or is being built yet — tenancy is enforced at the data layer
  (RLS) only.

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
for unauthenticated staff flows; feature folders (`customers`,
`estimates`, `jobs`, `invoices`, `payments`, `scheduling`, `reports`,
`service-catalog`, `settings`) for the authenticated staff app; `portal/`
for the customer-facing magic-link app (separate auth, separate layout —
see below). Settings now renders as a card-grid landing page
(`frontend/app/settings/page.tsx`) with full-width detail pages per
section, replacing the earlier persistent sidebar. Dark Mode is applied
app-wide via shared primitives — new UI should use the established
dark-mode-aware components/classes, not one-off `dark:` variants.

**Backend:** NestJS at `backend/src/`, one module per domain. Structured
JSON logging via pino, with Authorization headers/cookies/passwords
redacted. A global exception filter distinguishes intentional application
errors (safe to show the client) from unexpected ones (generic message to
client, full detail logged server-side). Modules present today:
`admin-data`, `ai`, `auth`, `automation`, `customers`, `dashboard`,
`documents`, `estimates`, `geocoding`, `health`, `invoices`, `jobs`,
`leads`, `mail`, `payments`, `portal`, `public` (quote-widget), `receptionist`,
`reports`, `scheduling`, `search`, `service-catalog`, `settings`, `sms`,
`weather`. `geocoding`, `weather`, `search`, `sms`, and `ai` are small,
single-purpose services rather than full CRUD modules — see their
one-line purposes below.

**New small modules (not full features — utility services):**
- `geocoding/` — OpenStreetMap Nominatim address→lat/long, Redis-cached
  with no expiry (an address's coordinates don't change).
- `weather/` — Open-Meteo current + daily forecast, Redis-cached with a
  real TTL (weather does go stale).
- `search/` — the global search dropdown's backend; reuses the same
  ILIKE/trigram matching condition `CustomersService.list()` established,
  but as lean, targeted, companyId-scoped queries per entity
  (Customers/Estimates/Invoices/Jobs), not a reuse of that heavier method.
- `ai/` (`ai-suggestions.service.ts`) — dashboard AI suggestions (uses
  `claude-sonnet-4-6`), Redis-cached.
- `sms/` — outbound SMS sending (Twilio), parallel to `mail/` for email.
- `admin-data/` — Owner-only permanent data deletion for test-data
  cleanup (Settings → Data Management). Real deletion, not a soft-delete
  toggle — treat with the same caution as any other destructive endpoint.
- `leads/` — see Section 0; one public capture endpoint, no separate
  Lead entity or UI.
- `public/quote-widget/` — public, unauthenticated quote-request capture
  (migration `028` added `estimates.source` for this). No frontend embed
  code found in this repo — if a public-facing widget exists, it's
  likely hosted separately and calling this API; do not assume a
  frontend for it exists here.

**Database:** PostgreSQL, accessed through Prisma for typed
queries/mutations and raw SQL (`$queryRawUnsafe`) for complex joins and
reporting queries. **Two migration locations exist and serve different
purposes — do not confuse them:**
- `backend/prisma/migrations/*.sql` — the authoritative, incrementally-
  applied migration set (40 files as of this audit, hand-numbered,
  `000`–`037`-ish with some renumbering history). This is what
  `scripts/run-migrations.sh` applies against Railway, tracked via a
  `schema_migrations` table so each file runs at most once.
- `init-scripts/*.sql` — a flat, pre-ordered **copy** of the same
  migrations, mounted into local Docker Compose Postgres via
  `docker-entrypoint-initdb.d` for fresh local dev databases only. Not
  the source of truth; don't hand-edit this independently of the real
  migrations directory.
- Migrations are applied via `psql`, **not** `prisma migrate dev/deploy`
  — this project does not use Prisma's own migration engine.

**Authentication:** JWT access/refresh tokens (`auth/` module),
email/password plus optional Google/Microsoft OAuth (degrades gracefully
if unconfigured). Magic-link auth exists separately for the customer
portal (`portal/` module) — **this is a genuinely separate auth system**;
several real bugs were found and fixed recently where the staff app's
global `JwtAuthGuard`/`AuthProvider` incorrectly intercepted portal
routes (see Section 7). Any new portal route must be explicitly
`@Public()` plus behind `PortalCustomerGuard`, not assumed to inherit
staff auth exemptions.

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
follow-ups, recurring-maintenance reminders, review requests, estimate
expiration reminders, payment-failed notifications. Sends real SMS
(Twilio) / email (Postmark) when configured; logs and no-ops otherwise.
Configuration is reachable through a real settings UI
(`frontend/app/settings/automation`).

**Reports:** `reports/` module, real backend with dedicated services and
DTOs; frontend page exists at `frontend/app/reports`.

**Settings:** `settings/` module backs a unified settings UI — now a
card-grid landing page (`frontend/app/settings/page.tsx`) plus full-width
per-section pages (Company, Branding, Business Defaults, Estimates
[merged Package Discounts], Payments, Email, SMS, Storage, Automation,
Google Reviews, Import/Export, Data Management, Lead Sources,
Appearance, Profile, Integrations). Several dead nav placeholders
(Leads, Properties, Automation-as-a-placeholder, Assets, Security,
Equipment Inventory, Backups) were removed during this window since the
real versions live elsewhere or don't exist as standalone screens by
design.

**PDF system:** Generated server-side in `invoices/` (and related
`documents/` services) for invoice PDFs; `company-context.service.ts`
supplies branding/reply-to data into that generation path, now including
the uploaded company logo where configured.

**Email system:** `mail/` module (BullMQ-style processor,
`mail.processor.ts`) sends and logs outbound mail; `email-log` table and
`documents/services/email-log.service.ts` track per-document send
history (used by Invoice "Email History"). Estimate delivery now goes
through an authenticated Customer Portal deep link (magic link),
PDF attachment removed from that particular email.

**Payments:** `payments/` module — real payment recording against
invoices (including standalone payments with no invoice, since
migration `036`), tip and processing-fee tracking on manual Card
payments, Zelle as a recordable method, and Stripe webhook handling for
**both** `payment_intent.succeeded` and `payment_intent.payment_failed`
(`portal.controller.ts::handleStripeWebhook`). Invoice payment can also
be completed by the customer directly through the portal.

**Scheduling:** `scheduling/` module — calendar-backed appointment
scheduling with technician assignment, now with auto-assign-to-self on a
job's first scheduling (Section 0) and appointment cancellation with a
reason + real status-history table (`appointment_status_history`,
migration `030`). The underlying model is still multi-tech-shaped; only
the specific solo-owner friction point (extra click every time) has been
addressed, not the model itself.

---

## 3. Production Modules

| Module | Status | Production-Ready | Key Architectural Decisions | Shared Components/Services Used |
|---|---|---|---|---|
| Authentication | Complete | Yes | JWT access/refresh; optional OAuth degrades gracefully; company invites | `auth/` guards, `TenantContextInterceptor` |
| Customers | Complete | Yes | Duplicate detection/merge, CSV import/export, presigned S3 uploads | `StorageService`, `customer-table.tsx`, `import-csv-modal.tsx` |
| Leads | Minimal, intentional | Yes (as scoped) | Single public capture endpoint → `Customer` row with `lead_status='lead'`; no separate entity/UI by design | `CustomersService.findOrCreateByEmail`, `MailService` (owner notification) |
| Estimates | Complete | Yes | Server-computed totals; service-specific validated detail fields; one-click convert-to-job; expiration workflow; discount source tracking | `computeDocumentTotals`, `EstimateForm.tsx`, `ActionBar.tsx`, `StatusTimeline.tsx`, `LineItemModal.tsx` |
| Jobs | Complete | Yes | One-click generate-invoice-from-job; completion flow with photos/signature; 4-level priority (normal/follow_up/high/emergency) | `CompletionFlow.tsx`, `PhotoSection.tsx`, `SignaturePad.tsx`, `ChemicalSection.tsx`, `EquipmentSection.tsx` |
| Scheduling | Complete | Yes (multi-tech model, auto-assign-to-self now closes the solo-owner friction gap) | Technician-assignment model built for crews; appointment cancellation + status history | `AppointmentDetailPanel.tsx` |
| Invoices | Complete | Yes | Server-computed totals; PDF + email send; email history tracking; portal view/pay/download | `computeDocumentTotals`, `DocumentEmailSection.tsx`, `email-log.service.ts` |
| Payments | Complete | Yes | Manual recording (incl. tip, processing fee, Zelle, no-invoice payments) + Stripe success **and failure** webhooks | `PaymentsSection.tsx` |
| Reports | Complete | Yes | Dedicated services/DTOs, real backend | — |
| Service Catalog | Complete | Yes | Backs Estimates' per-service pricing/validation | — |
| Settings | Mostly complete | Yes for built sections | Card-grid landing + full-width section pages; dead placeholders removed | `SettingsSectionShell.tsx` |
| Customer Portal | Backend complete; frontend Phase 2A built | Partial — Estimates + Invoices flows live; not fully hardened/audited yet | Magic-link auth (separate from staff auth); scoped AI chat; Stripe payment; viewed-tracking | — |
| AI Receptionist | Backend built, untested live | No | Twilio-integrated call handling; still no settings UI | — |
| Automation | Complete | Yes | Cron-driven; real SMS/email; settings UI; now covers expiration + payment-failed rule types | `automation-event.util.ts` |
| Dashboard | Backend + frontend built | Yes | Summary metrics, AI suggestions (cached), content width capped at 1600px | `ai-suggestions.service.ts` |
| Quote Widget | Backend built, no frontend found in this repo | Unknown — can't confirm from source | Public capture endpoint feeding Estimates with `source` attribution | — |
| Global Search | Complete | Yes | Lightweight cross-entity search dropdown | — |
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
document-like entities (estimates, jobs, invoices, and now appointments
via `appointment_status_history`).
Extend by: adding new status values to the shared enum/mapping, not by
building a one-off badge in a feature folder.

**`ConfirmDialog`** (`frontend/components/action-center/ConfirmDialog.tsx`)
Purpose: the app's real confirmation dialog. **Known gap, still open:**
Invoice Void (`frontend/app/invoices/[id]/page.tsx`) and Payment Void
(`frontend/components/payments/PaymentsSection.tsx`) both still use the
browser's native `confirm()` instead of this.

**`DocumentEmailSection`** (`frontend/components/documents/DocumentEmailSection.tsx`)
Purpose: shared "send this document by email + history" UI, used by
Invoices; designed to be reusable if Estimates ever needs the same UI
(Estimates currently deliver via portal deep-link instead — see Section 2).

**`SettingsSectionShell`** (`frontend/components/settings/SettingsSectionShell.tsx`)
Purpose: the settings-page layout used by every full-width section page,
reached from the card-grid landing page at `frontend/app/settings/page.tsx`.
New settings pages should extend this, not build a standalone page.

**`TenantContextService` / `TenantContextInterceptor`** (`backend/src/common/tenant/`)
Purpose: the only mechanism that sets the Postgres session variable RLS
depends on. Every tenant-scoped controller must sit behind
`TenantContextInterceptor`. Extend by: never bypassing this to call
Prisma directly for a tenant-scoped model.

**Automation Engine** (`backend/src/automation/`)
Purpose: cron-driven follow-ups, recurring reminders, review requests,
estimate expiration reminders, payment-failed notifications.
Extend by: adding new rule types to this engine's `rule_type` CHECK
constraint (see migration `029` as the most recent example), not
building a second scheduler.

**Email system** (`backend/src/mail/`, `email-log` table)
Purpose: single outbound-mail path with logging. Extend by: routing new
transactional email types through `mail.processor.ts`, not calling
Postmark directly from a feature service.

**SMS system** (`backend/src/sms/`)
Purpose: outbound SMS via Twilio, parallel structure to `mail/`. Extend
new SMS types through here, not a direct Twilio call from a feature
service.

**Permission system** (`auth/` guards + `PermissionGate.tsx`)
Purpose: backend guards are the real boundary; `PermissionGate` is
UI-only convenience. Extend by: adding new permission strings to the
backend guard definitions first; frontend gating follows, never leads.

**Migration runner** (`scripts/run-migrations.sh`)
Purpose: applies `backend/prisma/migrations/*.sql` against
`$DATABASE_URL` in order, tracked in `schema_migrations` so each file
runs once. Intended as a Railway pre-deploy command. Extend by: keep
writing new migration files the same additive, `IF NOT EXISTS`-safe way
— the runner assumes idempotent-or-already-tracked, not universally
re-runnable.

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
- **estimates.source** (migration `028`): nullable, records attribution
  (e.g. "Website Instant Quote" from the Quote Widget). NULL for
  staff-created estimates.
- **estimates.discount_source` / `invoices.discount_source`**
  (migration `034`): nullable, `'package'` or `'manual'` — distinguishes
  *why* a discount exists, not *how* it's calculated (`discount_type`
  already covers that). Snapshots from estimate to invoice at generation
  time, same as the rest of the financial snapshot.
- **estimates → jobs**: an accepted estimate converts to a job
  (`convertToJob`); the job references its originating estimate. A
  manual `convert-to-job` endpoint also still exists independently —
  see ADR-007, still unresolved.
- **jobs → invoices**: `generateFromJob` creates an invoice from a
  completed job's real line items, current tax rate, and due-date
  defaults — not a manual re-entry.
- **jobs.priority** (migration `031`, replacing the original 3-value
  constraint): `normal | follow_up | high | emergency`. Confirmed via
  exhaustive search to have had zero real usage under the old 3-value
  set before this change, so the replacement carried no data-migration
  risk.
- **invoices → payments**: one-to-many; payments recorded against a
  specific invoice, feeding `Balance Due`. `payments.invoice_id` is now
  nullable (migration `036`) — a payment can be recorded against a
  customer directly with no invoice on file. `payments.customer_id`
  remains required.
- **payments.tip_amount** (migration `035`) and
  **payments.processing_fee_amount` / `card_type`** (migration `037`):
  both additive, both deliberately separate from `payments.amount` so
  every existing revenue/balance/LTV calculation stays correct
  unchanged. `card_type` is `credit | debit`, staff-selected at entry
  time since manually-recorded Card payments have no real Stripe
  metadata.
- **invoices.viewed_at**: real, intentional column (migration `022`) —
  set when a customer views their invoice via the portal
  (`portal-data.service.ts`). Do not remove this field; it backs a real
  feature.
- **appointments.cancellation_reason` + `appointment_status_history`**
  (migration `030`): mirrors the existing job/payment/estimate
  status-history pattern exactly — not a new pattern.
- **customers.lead_status**: `lead | active | inactive | archived |
  churned` (migration `032` added `archived`, replacing the original
  base-schema constraint that silently rejected it — found only by
  testing against a real database).
- **customers.review_received_at** (migration `033`): nullable
  timestamp; "request sent" is already derivable from
  `automation_log` (`rule_type = 'review_request'`), so this is the only
  new storage genuinely needed for review tracking. No Google Business
  Profile integration exists in this codebase to automate detection —
  this is a manual/webhook-free signal.
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
- **automation_log.rule_type**: CHECK constraint extended repeatedly as
  new event types are added (`estimate_followup`, `recurring_reminder`,
  `review_request`, `estimate_viewed`, `estimate_approved`,
  `estimate_declined`, `invoice_viewed`, `invoice_paid`,
  `payment_reminder`, `estimate_expiration_reminder`, `job_thank_you`,
  `estimate_expired`, `payment_failed` as of migration `029`) — extend
  this constraint for new event types, never build a second log table.
- **service_catalog**: backs Estimates' per-line-item pricing and
  service-specific validated fields.
- **scheduling**: appointment records reference a technician
  (`assignedTo`/technician id) — a multi-tech assumption baked into the
  schema; auto-assign-to-self (Section 2/3) works within this model
  rather than replacing it.
- **audit history pattern**: status-change history is modeled per
  document type (estimates/jobs/invoices/appointments) and rendered
  through the shared `StatusTimeline` component rather than a single
  global audit table.

---

## 6. Business Workflow

```
Lead — public, unauthenticated capture (website form or Quote Widget);
       becomes a Customer with lead_status='lead', source attribution
       preserved on the resulting Estimate if applicable
  ↓
Estimate — created (optionally pre-filled from an existing Customer/Property), priced server-side
  ↓
Sent — delivered via authenticated Customer Portal deep link (magic link), no PDF attachment
  ↓
Viewed — tracked in the portal
  ↓
Accepted — customer accepts via portal (signature capture) or staff marks accepted; expiration reminders/expiry handled by automation if unaddressed in time
  ↓
Job — one-click convertToJob() from the accepted estimate (automatic on acceptance, per ADR-001); a separate manual convert-to-job endpoint also still exists — ADR-007, unresolved
  ↓
Scheduling — job gets a date/time; first scheduling auto-assigns to the scheduling user if no technician is specified, later reschedules preserve the existing assignment
  ↓
Completed — CompletionFlow captures photos, signature, chemicals/equipment used
  ↓
Invoice — one-click generateFromJob() from the completed job's real line items and current tax rate
  ↓
Payment — recorded manually (cash/check/Zelle/Card with tip + processing fee) or via Stripe (success and failure both handled), or paid directly by the customer through the portal
  ↓
Review Request — automation engine can trigger post-payment, if configured; review_received_at can be marked once a review actually comes in
  ↓
Recurring Reminder — automation engine can schedule maintenance follow-ups, if configured
```

---

## 7. Current Known Limitations

**High**
- None currently open.

**Medium**
- AI Receptionist backend is untested against a live call and has no
  settings UI.
- Customer Portal frontend is real but young: Phase 2A (Estimates +
  Invoices) shipped alongside several critical auth-routing bugs that
  had to be fixed in the same window (staff `AuthProvider`/global
  `JwtAuthGuard` incorrectly intercepting portal routes; missing
  `@Public()` decorators; a magic-link DTO missing validation decorators
  entirely). Treat any *new* portal work as needing the same scrutiny
  that surfaced those — don't assume the portal auth path is as hardened
  as the staff one yet.
- Quote Widget has a real backend endpoint but no confirmed frontend in
  this repo — don't assume a working public embed exists without
  checking wherever it's actually hosted.

**Low**
- Invoice Void and Payment Void both use the browser's native `confirm()`
  instead of the shared `ConfirmDialog` component.
- Scheduling's underlying model is still built for multi-technician
  assignment; auto-assign-to-self closes the daily-friction gap for a
  solo owner but the picker UI itself hasn't been simplified away.

**Resolved since the last audit (see Section 0 for detail)**
- Stripe `payment_intent.payment_failed` webhook — now handled.
- Auto-assign-to-self for Jobs/Scheduling — now implemented.
- Estimate Expiration Workflow — now implemented.

---

## 8. Future Roadmap

The old doc's "Next" items (Estimate Expiration Workflow, auto-assign)
are both done — see Section 0. Nothing in the repo currently states an
authoritative next priority; the items below are inferred from what's
still open in Section 7, not a confirmed decision.

**Candidates for Next** (unordered — confirm with the project owner
before starting any of these; do not assume priority)
- Route Invoice Void / Payment Void through `ConfirmDialog` instead of
  `confirm()` — small, contained, closes a long-standing Low item.
- Resolve ADR-007 (deprecate vs. keep the manual convert-to-job
  endpoint) — a decision, not a build; low effort either way, but
  overdue.
- Confirm what, if anything, calls the Quote Widget backend today, and
  whether a frontend/embed needs to be built or already exists
  elsewhere.
- Harden the Customer Portal further given how many auth-routing bugs
  surfaced in Phase 2A — a deliberate audit pass, not just waiting for
  the next bug report.

**Later**
- On-site/mobile payment collection flow surfaced directly from the
  Job/Invoice screen (payment link or prominent "mark paid") — not
  found in the repo as built; status unconfirmed, may still be open.

**Someday**
- Users & Roles, multi-tech features generally — deferred until there
  are actual employees.
- AI Receptionist settings UI + live-call validation.
- Simplifying the technician-assignment UI itself for solo-owner
  accounts, beyond the auto-assign-on-first-scheduling shortcut already
  built.

---

## 9. Coding Standards

- **Additive migrations only.** Never edit a shipped migration file;
  add a new numbered one in `backend/prisma/migrations/` (and mirror it
  into `init-scripts/` for local Docker Compose parity — see Section 2).
- **Never duplicate business logic.** Financial totals go through
  `computeDocumentTotals`; tenant scoping goes through
  `TenantContextService`; outbound email goes through `mail.processor.ts`;
  outbound SMS goes through the `sms/` module.
- **Extend existing systems first.** A new settings page extends
  `SettingsSectionShell`; a new status display extends `StatusBadge`/
  `StatusTimeline`. Do not build a parallel one-off version.
- **RLS-safe.** Any new tenant-scoped table gets a real RLS policy and
  is only ever queried through the tenant-context-aware path.
- **Raw SQL casts required.** Any `$queryRawUnsafe` parameter touching a
  `uuid` or `jsonb` column is explicitly cast in the SQL string.
- **No parallel implementations.** One PDF system, one email system, one
  SMS system, one automation engine, one permission system — new
  features integrate with these, they don't reimplement a narrower
  version.
- **Production-ready over "nice architecture."** Features are built to
  the depth the solo-owner workflow actually needs, not to demonstrate
  enterprise completeness.
- **Verify before calling something done:**
  - Verify against a real Postgres instance (not just Prisma's type
    layer) — several real bugs (migrations `031`, `032`) only surfaced
    against actual Postgres type-checking, not the approved design on
    paper.
  - Verify TypeScript compiles clean (`tsc`/`npm run build`).
  - Verify migrations actually apply cleanly, in order, and confirm
    (don't assume) that Railway's Pre-Deploy Command is actually wired
    to `scripts/run-migrations.sh` before treating a migration as live
    in production.
  - Verify the frontend build (`next build`) where frontend changes are
    involved.
  - For anything touching the Customer Portal specifically: verify the
    route is genuinely reachable unauthenticated/portal-authenticated as
    intended — this exact class of bug (staff auth silently swallowing
    portal requests) has happened multiple times.

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
time (`company-context.service.ts`), now including the uploaded company
logo where configured. Invoices store financial data only — not a
branding snapshot.

### ADR-005
**Decision:** Automation uses exactly one engine.
**Reason:** All automated messaging (follow-ups, reminders, review
requests, expiration reminders, payment-failed notices) runs through the
existing cron-driven engine in `automation/`.
**Rule:** Never create a second cron job or parallel scheduler — new
automation types extend this engine's rule types (migration `029`'s
`payment_failed` addition is the most recent example of the established
pattern).

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
`estimates.controller.ts`) is **still live** — confirmed still present
at this audit — and was not removed when auto-creation was added.
**Open item, still not decided:** whether this manual endpoint should be
deprecated/removed now that acceptance handles it automatically, or kept
intentionally as a manual override/repair path. Do not assume it's dead
code, and do not assume it's intentional — this needs an explicit
decision, not a silent audit-and-forget. **This has now carried across
at least two PROJECT_CONTEXT.md revisions unresolved — worth actually
deciding rather than deferring a third time.**
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
Extended to appointments (migration `030`) on the same pattern.
**Rule:** Never invent a second audit implementation.

### ADR-010
**Decision:** Shared UI components are always extended, never copied.
**Components:** `StatusBadge`, `StatusTimeline`, `ConfirmDialog`,
`DocumentEmailSection`, `SettingsSectionShell`.
**Known exceptions to fix, not a precedent to follow:** Invoice Void
*and* Payment Void currently use the browser's native `confirm()`
instead of `ConfirmDialog` (see Section 7, Low). This is a gap to close,
not a second pattern to treat as valid.

### ADR-011 (new)
**Decision:** Leads are not a separate entity or module.
**Reason:** A public capture endpoint writes directly into `Customers`
with `lead_status='lead'` via the existing
`CustomersService.findOrCreateByEmail` path — the same reasoning already
applied to Properties (no dedicated page, avoids a duplicate system).
**Rule:** Do not build a parallel Leads table/module without an explicit
decision to reverse this — the current design is intentional, not an
oversight, even though a bare "Leads: Not built" reading of an earlier
doc version suggested otherwise.

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
✔ Payments Architecture (success + failure Stripe webhooks, manual
  recording incl. tip/fee/Zelle/no-invoice payments)
✔ Scheduling Architecture (Appointments-backbone model, see ADR-002;
  auto-assign-to-self layered on top)
✔ Service Catalog (backs Estimates pricing/validation)
✔ Reports (dedicated backend module, real DTOs/services)
✔ Settings (card-grid landing + dynamic section routing)
✔ Automation Engine (cron-driven, real SMS/email, settings UI, expanded
  rule types)
✔ Estimate Expiration Workflow (migration `027` + automation/settings
  wiring)
✔ Dark Mode (app-wide, shared primitives)

Assume these are correct unless a change directly touches them. Do not
re-derive or re-verify these from scratch on a routine basis — that's
exactly the token cost this document exists to avoid.

**Not on this list on purpose** (genuinely unverified or incomplete —
see Section 7): AI Receptionist live-call behavior and settings UI,
Customer Portal frontend full hardening (young, real bugs recently
fixed), Quote Widget frontend/embed existence, the duplicate
convert-to-job path in ADR-007.

---

## 12. Session Handoff

**What was just completed:** `PROJECT_CONTEXT.md` regenerated against
the real repo at commit `f274921` (2026-08-18), after the prior version
(last touched 2026-08-11, commit `37edb7f`) was found to be stale by
~57 commits — including two of its own "Next" roadmap items (Estimate
Expiration Workflow, auto-assign-to-self) already being shipped, and one
of its "open Medium gap" items (Stripe failed-payment webhook) already
being closed.

**What was verified:** Repo cloned and read directly from source —
migration files (`init-scripts/`, `backend/prisma/migrations/`),
backend module structure (`backend/src/*`), frontend route structure
(`frontend/app/*`), specific source files for every claim that changed
from the prior doc (Stripe webhook handler, auto-assign logic, ADR-007
endpoint, Invoice/Payment Void `confirm()` usage, Leads capture flow,
receptionist frontend absence). `docs/*.md` files were checked for
staleness (all found older than even the prior PROJECT_CONTEXT.md) and
excluded as sources of current truth.

**What remains:** Nothing in progress — this is a documentation
checkpoint, not mid-module work. Section 8's "Candidates for Next" are
inferred from open gaps, not a confirmed decision — get explicit
direction before starting any of them.

**What should be built next:** Undecided — see Section 8. Do not assume
either roadmap item from the previous doc version; both are done.

**Architectural warnings:** Two portal-specific bugs recurred in the
recent commit history (staff auth intercepting portal routes; a DTO
missing validation decorators). Both are fixed, but the pattern —
assuming portal routes inherit staff-app exemptions/behavior when they
don't — is worth remembering as a class of bug, not just two individual
fixes. Standing warnings from Section 9 (raw SQL casts, additive
migrations, RLS-only tenant access, confirming Railway's Pre-Deploy
Command is actually wired before trusting a migration is live) remain
load-bearing.
