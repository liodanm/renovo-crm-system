# PROJECT_CONTEXT.md (Archived — full history)

*This file is the complete, unabridged project history and ADR record, preserved as of the last real sync from the actual GitHub repository. The lean, current-state reference for everyday session use is `PROJECT_CONTEXT.md`. Pull this file in only when you need the detailed backstory behind a specific decision.*

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
in `docs/GETTING_STARTED.md`) — **not** `prisma migrate dev/deploy`;
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
| Estimates | Complete | Yes | Server-computed totals; service-specific validated detail fields; one-click convert-to-job; `validUntil` now settable — closes the previously-dead Estimate Expiration Workflow automation; discount-value reconstruction and partial-update discount/tax preservation bugs fixed | `computeDocumentTotals`, `EstimateForm.tsx`, `ActionBar.tsx`, `StatusTimeline.tsx` |
| Jobs | Complete | Yes | One-click generate-invoice-from-job; completion flow with photos/signature; Photos/Chemicals/Equipment embedded inline in the Complete panel | `CompletionFlow.tsx`, `PhotoSection.tsx`, `SignaturePad.tsx`, `ChemicalSection.tsx`, `EquipmentSection.tsx` |
| Scheduling | Complete | Yes (multi-tech assumption not yet simplified for solo use) | Technician-assignment model built for crews; technician double-booking blocked; appointments can be cancelled with a reason, preserving history | `AppointmentDetailPanel.tsx`, `ConfirmDialog` |
| Invoices | Complete | Yes | Server-computed totals; PDF + email send; email history tracking; Void blocked when active payments exist | `computeDocumentTotals`, `DocumentEmailSection.tsx`, `email-log.service.ts` |
| Payments | Complete | Yes | Manual payment recording + Stripe webhook for both success and failure; webhook invoice lookups explicitly scoped by companyId | `PaymentsSection.tsx` |
| Reports | Complete | Yes | Dedicated services/DTOs, real backend | — |
| Service Catalog | Complete | Yes | Backs Estimates' per-service pricing/validation | — |
| Settings | Partial | Yes for built sections; several UI-only | Unified shell + dynamic section routing; Integrations page added | `SettingsSectionShell.tsx`, `IntegrationsService`, `SystemHealthService` |
| Customer Portal | Backend complete, frontend unconfirmed | Backend yes; frontend unverified | Magic-link auth; scoped AI chat; Stripe payment | — |
| AI Receptionist | Backend built, untested live | No | Twilio-integrated call handling; no settings UI yet | — |
| Automation | Complete | Yes | Cron-driven; real SMS/email; now has a settings UI | `automation-event.util.ts` |
| Leads | Not built | No | Nav entry exists, marked "Soon" | — |
| Properties | Sub-feature of Customers only | Yes (as-is) | No dedicated page by design | — |

---

## 4. Shared Systems

**`computeDocumentTotals`** — single source of truth for subtotal/discount/tax/total math. Used in Estimates, Invoices. Extend by adding new discount/tax modes here only — never re-derive totals inline.

**`StatusBadge` / `StatusTimeline`** — consistent status rendering/history across estimates/jobs/invoices. Extend the shared enum, don't build one-off badges.

**`ConfirmDialog`** — the app's real confirmation dialog. Known gap: Invoice Void still uses native `confirm()` instead. Adopted by Scheduling's Cancel Appointment — note: render as a sibling, not a child, when nesting inside a component with its own click-outside-to-close backdrop, or a click bubbles up and closes the parent.

**`DocumentEmailSection`** — shared "send by email + history" UI, used by Invoices, reusable for Estimates.

**`IntegrationStatusService`** — single source of truth for "is provider X configured," checks Railway env vars only, never Postgres. Covers stripe/postmark/twilio/s3/anthropic.

**`IntegrationsService`** — backs Settings > Integrations. Delegates every connectivity check to the service that already owns that provider. Persists only non-secret metadata (`companies.settings.integrationHealth`) and business links (`companies.settings.integrations`). No provider secret ever stored in Postgres (ADR-011).

**`SystemHealthService`** — the one place DB/Redis reachability is checked, shared by `/health` and Settings > Integrations.

**`SettingsSectionShell`** — the one settings-page layout; new settings pages extend this.

**`TenantContextService`/`TenantContextInterceptor`** — the only mechanism setting the Postgres session variable RLS depends on.

**Automation Engine** — cron-driven follow-ups/reminders/review requests. Never build a second scheduler.

**Email system** (`mail/`, `email-log`) — single outbound-mail path with logging.

**Permission system** — backend guards are the real boundary; `PermissionGate` is UI convenience only.

**Raw SQL type-cast convention** — any `$queryRawUnsafe` parameter touching `uuid`/`jsonb` must be explicitly cast in the SQL string.

---

## 5. Database Design

- **estimates → estimate_line_items**: one-to-many; service-specific JSONB detail fields validated per type. Full cost/profitability breakdown gated behind a permission, never exposed to the portal.
- **estimates → jobs**: accepted estimate converts to a job (`convertToJob`).
- **jobs → invoices**: `generateFromJob` creates an invoice from the completed job's real line items.
- **invoices → payments**: one-to-many, feeds `Balance Due`.
- **invoices.viewed_at**: real column, set when a customer views their invoice via the portal — do not remove.
- **email_log**: polymorphic (`related_type`/`related_id`), currently tracks invoices.
- **companies.settings**: JSONB blob merged via `jsonb_set`, never overwritten wholesale (branding, package discounts, lead sources, integration health, business links).
- **audit history pattern**: status-change history modeled per document type (estimates/jobs/invoices/payments/appointments), rendered through `StatusTimeline` — never a single global audit table.
- **appointments.cancellation_reason** (migration 030): set by `cancel()`. Row is never deleted on cancellation (unlike `unschedule()`, which still deletes).
- **payments.status = 'failed'**: existed unused in the CHECK constraint before migration 029's webhook handler started writing it. Never affects `invoices.amount_paid`/`status`.
- **estimates.validUntil**: pre-existing column, now actually settable — closed the previously-dead Estimate Expiration Workflow.
- **Invoice Void payment guard**: blocks voiding an invoice with any `succeeded`/`partially_refunded` payment. Existing payments never reversed by this check.
- **discount_source** (migration 034, both estimates and invoices): distinguishes package-applied vs. manually-typed discounts, snapshotted through the same Invoice-generation path as every other financial field.
- **`Customer.leadStatus` CHECK constraint**: lives inline in the base schema (`init-scripts/00-schema.sql`), not a separate migration — easy to miss searching migrations only. Extended by migration 032 to include `'archived'`.

---

## 6. Business Workflow

```
Lead (future)
  ↓
Estimate — created, priced server-side
  ↓
Accepted — customer via portal or staff
  ↓
Job — one-click convertToJob() from the accepted estimate
  ↓
Scheduling — date/time + technician assignment
  ↓
Completed — CompletionFlow captures photos, signature, chemicals/equipment
  ↓
Invoice — one-click generateFromJob()
  ↓
Payment — manual or Stripe
  ↓
Review Request / Recurring Reminder — automation engine, if configured
```

---

## 7. Known Limitations (as of last full audit)

**Medium:** multi-tech scheduling assumption not simplified for solo use (auto-assign-to-self later closed part of this — see §23); auth/session-lifetime redesign (A3) explicitly deferred until multi-user SaaS prep begins — do not touch without that explicit instruction; AI Receptionist untested live, no behavior-settings frontend; automation invisible until a message is already sent, no cancel-before-send; no duplicate-estimate shortcut surfaced on the estimate page.

**Low:** Invoice Void uses native `confirm()` instead of `ConfirmDialog`; Customer Portal frontend completeness unconfirmed; calendar drag-reschedule is desktop-only by design (Reschedule modal covers mobile).

---

## 8. Roadmap Snapshot (as of last full audit — see current `PROJECT_CONTEXT.md` for the live version)

Shipped: Estimate module fixes, Invoice Void payment guard, Stripe failed-payment handling, scheduling conflict detection, Completion Flow mobile improvement, appointment cancellation + audit history, repo-integrity CI.

Deferred by explicit product decision: A3 auth/session redesign.

Approved spec, not built: Job Archive System (full spec in §17).

Next: solo-owner auto-assign (later shipped, §23), duplicate-estimate shortcut, automation-pending visibility, AI Receptionist behavior-settings home.

Someday: Leads module, Users & Roles/multi-tech generally, AI Receptionist live-call validation, real integrations for Coming Soon cards (Roof Measurement, Google Maps, QuickBooks, Zapier, Google Calendar, Outlook, CompanyCam).

---

## 9. Coding Standards

- Additive migrations only — never edit a shipped one.
- Never duplicate business logic — totals through `computeDocumentTotals`, tenant scoping through `TenantContextService`, email through `mail.processor.ts`.
- Extend existing systems first — no parallel one-off versions.
- RLS-safe — every new tenant-scoped table gets a real policy.
- Raw SQL casts required on `uuid`/`jsonb` parameters.
- No parallel implementations — one PDF system, one email system, one automation engine, one permission system.
- Production-ready over "nice architecture" — build to the depth the solo-owner workflow needs.
- Verify before calling something done: real Postgres instance (not just Prisma's type layer), `tsc`/`npm run build` clean, migrations apply cleanly in order, `next build` succeeds where frontend changes are involved.

---

## 11. Architecture Decisions (ADR)

### ADR-001 — Accepting an Estimate automatically creates a Job.
Verified in `estimates.service.ts::acceptManually` — protected by a duplicate-creation guard. Job starts in "Needs Scheduling."

### ADR-002 — Appointments are the single scheduling backbone.
Already consumed by AI Receptionist and Customer Portal. `jobs.scheduled_start` is denormalized data only. Never create a second scheduling system.

### ADR-003 — Service Catalog remains optional, not mandatory.
Line items always remain directly editable regardless of catalog state.

### ADR-004 — Branding is never copied into documents at creation time.
Read live from Settings at render/PDF-generation time. Invoices store financial data only.

### ADR-005 — Automation uses exactly one engine.
All automated messaging runs through the existing cron-driven engine. New types extend its rule types, never a second scheduler.

### ADR-006 — Every tenant-scoped query must execute through `withTenantContext`.
The only mechanism setting the Postgres session variable RLS depends on. Never call the base Prisma client directly for a tenant-scoped model.

### ADR-007 — Manual convert-to-job endpoint still live alongside auto-creation (ADR-001).
Open item, not decided: deprecate, or keep as an intentional manual override/repair path.

### ADR-008 — All document totals use `computeDocumentTotals`.
Never duplicate this calculation inline.

### ADR-009 — Every entity uses the same audit/status-history pattern.
Single rendering path (`StatusTimeline`). Never invent a second audit implementation.

### ADR-010 — Shared UI components are always extended, never copied.
`StatusBadge`, `StatusTimeline`, `ConfirmDialog`, `DocumentEmailSection`, `SettingsSectionShell`. Known exception to fix, not a precedent: Invoice Void's native `confirm()`.

### ADR-011 — No integration provider secret is ever stored in Postgres.
Railway env vars are the single source of truth for Stripe/Postmark/Twilio/S3/Anthropic. Settings > Integrations persists only non-secret metadata and genuinely public business links. Per-tenant bring-your-own-keys would be a new, explicit decision requiring real encryption/key-management — not an incremental addition.

### ADR-012 — Repository integrity is enforced by CI, not convention alone.
Found and fixed: a stray fully-unwired duplicate source tree, and `init-scripts/` drifted 21 migrations behind. Added `scripts/check-duplicate-source.sh` and `scripts/check-migration-sync.sh`, both proven to catch their target failure by intentional reintroduction. Any new migration must be copied into `init-scripts/` in the same PR.

### ADR-013 — Jobs get an Archive system, not Delete/soft-delete.
`archivedAt`/`archivedBy`/`archiveReason` as an independent business state from `status` — reusing `status` for archiving would silently remove a completed job's financial contribution from revenue/completion-trend/labor-hours reports. Full policy in §17.

---

## 12–19. Session Handoffs & Feature Detail (chronological)

*(Preserved for reference — condensed from the full original text. Each entry below was a "shipped" or "handoff" note in its original session.)*

**§12 — Settings > Integrations shipped.** Single consolidated page, zero new migrations, zero new credential storage. Closed a real bug: `companies.google_review_url` had a read path but no write path — now sourced from writable JSONB. Verified: backend/frontend `tsc` clean, 38/38 tests, real `next build` succeeding.

**§13 — Solo-Owner Productivity Sprint 1 (2026-07-23).** Eight items: payment amount auto-fill, Dashboard Today's Jobs made clickable, Customer Profile "Money at a Glance" card, Jobs List Today/This Week/All filter (found `scheduledStart` was already returned by the backend but never typed on the frontend — fixed), Job Detail field-ops gated by status, Complete Job quick links, Estimate creation customer prefill (required a `Suspense` boundary — found via a real `next build` failure, not `tsc`), Customer Table Balance Due + Last Service columns. Product Improvement Score raised from ~52 to ~61 overall.

**§14 — Sprint 2: Customer Intake & Estimate Workflow (2026-07-23).** Frontend-only. New `CustomerPicker` component replacing a plain select; Quick Add reuses the existing `CreateCustomerModal` rather than a second form; Estimate list Needs Response/Accepted/All filter; customer search + recency sort via a new localStorage helper (`use-recent-customers.ts`); draft persistence for new (never edit) estimates. Known, disclosed limitation: address search proxies through `primaryLocation` (city/state) only, not full street address.

**§15 — Instant Quote Widget Phase 1.** Public, unauthenticated `/public/:companySlug/quote-widget/*` producing a completely real Estimate. Zero business logic of its own — pure orchestration into existing services. The one new piece of logic: manually wrapping calls in `TenantContextService.run()` since `@Public()` routes have no ambient tenant context otherwise. `CustomersService.findOrCreateByEmail()` added (additive; `create()` itself unchanged, still throws on conflict for every staff call site). One additive column, `estimates.source`. Hardening pass added Redis-backed idempotency, structured logging, and typed DTO mappers replacing `as any` casts. Standalone embeddable widget frontend bundle not yet built — backend-only this phase.

**§16 — Production Hardening Pass (2026-07-25).** Repo integrity audit first (removed a stray duplicate source tree, regenerated `init-scripts/`, added the two CI scripts — ADR-012). Full Estimate module audit found and fixed three real bugs (`validUntil` write path, discount-value reconstruction, partial-update discount/tax zeroing). Four ranked findings (A1 Invoice Void payment guard, A2/A6 Stripe failure handling + webhook tenant scoping, A4 scheduling conflict detection) each verified against a real database. Solo-owner workflow audit produced Completion Flow mobile improvement and appointment cancellation with audit history.

**§17 — Job Archive Policy (approved spec, zero code).** Full detail in the "Job Archive Policy" reasoning under ADR-013 above — two independent facts (`status` vs. `archivedAt`/`archivedBy`/`archiveReason`), a full screen-by-screen classification (8 operational views hide archived jobs, 7 historical/financial views always show them), and explicit UI copy requirements ("Archive Job," never "Delete"). Treat as a product requirement to implement against directly when picked up.

**§18 — Sprint 1 / RC1.** Estimate Builder UX polish (Cancel button, required-field indicators, empty state), Customer + Property combined creation with a Retry/Skip flow, duplicate-click protection audited, Lifetime Value shipped in full (live updates on every payment/refund/void path + a historical backfill script), a second less-accurate "Lifetime Spend" metric removed in favor of the one real `Customer.lifetimeValue`, and a real bug found and fixed where Customer Merge wasn't recalculating `lifetimeValue` after reassigning payments.

**§19 — Service Catalog Ordering.** `PATCH /service-catalog/reorder`, declared before the existing `:id` route (NestJS route-matching order). `sort_order` remains the only ordering field — no migration. Desktop drag-and-drop, mobile Up/Down buttons (deliberate — gestures are easy to fumble one-handed in the field). Post-review hardening added real error handling to a previously-silent failure path and a name-conflict pre-check that had been missing despite a real unique constraint existing.

---

## 20. Customer Status Workflow (shipped)

`Customer.leadStatus` stays the single stored relationship field; a separate, always-derived "journey stage" is computed live from Estimate/Job status via `getJourneyStages()`, never stored. Automatic `lead → active` transition on estimate acceptance, via one shared method called from both the staff and portal acceptance paths (two genuinely separate entry points, found only by tracing the code). A real audit-correction: the `leadStatus` CHECK constraint was believed missing but actually existed inline in the base schema, not a separate migration — extended by migration 032 to add `'archived'`. Also corrected pre-ship: `getJourneyStages()`'s status-precedence bug (completed checked before estimate-sent) and a mistaken "missing index" finding (the indexes already existed in the base schema). `getJourneyStages()` is bulk by design — same method serves both the list and detail pages, avoiding N+1. Found and closed a real gap: `leads.service.ts` was bypassing `CustomersService` entirely — now routes through the shared `findOrCreateByEmail()`.

## 21. Package Discounts (shipped)

`computeDocumentTotals()` unchanged — Package Discounts only ever set the existing `discountType`/`discountValue` fields, exactly like manual entry would. One boolean (`isManualDiscount`, frontend-only) drives auto-apply vs. manual-override, with auto-restore on reset to zero. Real, disclosed finding (not fixed by this feature): `InvoicesService.generateFromJob()` didn't carry forward *any* estimate-level discount at invoice-generation time — later fixed in §22.

## 22. Invoice Generation Financial Integrity Fix (shipped)

The real bug §21 flagged: `generateFromJob()` recomputed everything fresh from job line items with discount always `undefined` — every discounted estimate generated a full-price invoice. Fixed by snapshotting `subtotal`/`discountType`/`discountAmount`/`taxRate`/`taxAmount`/`totalAmount` directly from the source estimate when one exists, matching the pattern `Estimate.duplicate()` already proved correct. Verified against a real database across every discount type, and specifically proved the tax-rate snapshot holds even after the company's default tax rate changes before invoicing.

## 23. Auto-Assign-to-Self on Scheduling (shipped)

Only `Appointment.assignedToCompanyUserId` populated automatically (not `Job.assignedUserId` — deliberate single-source-of-truth call). Fires only on a job's first scheduling; rescheduling always preserves an existing assignment. AI Receptionist creates jobs already `scheduled` without ever creating an Appointment row — a pre-existing fact, correctly unaffected by this feature, not a gap it left behind.

## 24. Customer Intelligence Panel (shipped)

Extends `getServiceHistory()` rather than a new endpoint — almost every requested metric was already being fetched, just not surfaced. Two genuinely new queries: active Service Catalog items (upsell comparison) and `AutomationSettings` (reusing the existing recurring-reminder interval). Zero new storage. Verified against a real, hand-calculable database scenario.

## 25. Review Tracking (shipped)

A real mistake caught and corrected mid-implementation: `ReviewRequest`/`Review` are real tables but completely unused anywhere in the app — building on them would have made "Request Sent" permanently, silently wrong. Corrected to derive from `AutomationLog` (the table the real send logic actually writes to) plus one new nullable column, `Customer.reviewReceivedAt`, for the manual "reviewed" flag (no Google Business Profile integration exists to automate this).

## 26. Review Tracking — Final Verification (v0.1.0-rc.2)

Full realistic sequence verified against a real database (never requested → sent → newer failed request → manually marked reviewed, confirming override behavior). Multi-company isolation tested directly with an identically-named customer in a second company — zero contamination.

## 27. Pre-Ship Re-Confirmation (v0.1.0-rc.3)

No code changed since rc.2 — a genuine re-confirmation via a fresh-database smoke test, not a re-discovery.

## 28. Invoice/Estimate PDF Redesign + Estimate Property Auto-Select (shipped)

`discountSource` (migration 034) wired end to end, including through the Invoice snapshot mechanism from §22 — verified a package-sourced estimate correctly produces a package-sourced invoice. **A real process mistake caught before it repeated the §25-adjacent production incident:** the new migration was written but not copied to `init-scripts/` — caught by this session's own real-database verification before packaging, not after a broken page. PDF redesign (centered logo/name, prominent Total, redesigned line items, Payment Methods with the real company phone number, Package-vs-manual discount labeling) verified by actually rendering and inspecting real output. Logo upload added by reusing the exact presigned-S3 pattern already proven for customer photos. Estimate property auto-select ships with real edge-case protection (never overwrites an existing selection, a restored draft, or a deliberate clear).

---

**Note on subsequent sessions not reflected above:** further work after this file's last real sync (migration 034's production outage and fix, PROJECT_CONTEXT.md's own condensing into the current lean format) is documented in the live `PROJECT_CONTEXT.md`, not here.
