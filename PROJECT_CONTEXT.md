# Renovo CRM — Project Context

*Lean reference for every Claude session. Full build history, ADRs, and detailed postmortems: `PROJECT_HISTORY.md`.*

**⚠️ Version tracking is inconsistent — flagged, not resolved:** the prior context doc's header tracked a separate "CRM Version" (last seen v0.26.0) distinct from `backend/package.json`'s semver (last seen `0.1.0-rc.4` after this session's work). These two numbers have never been reconciled to one source of truth. Until they are, don't trust either number alone — check `backend/package.json` directly for the real current version, and treat any "CRM Version" header as informational only.

## 1. Product Overview

- **What it is:** Multi-tenant SaaS CRM purpose-built for pressure washing businesses — leads, customers, estimates, jobs, scheduling, invoicing, payments, self-service customer portal, AI phone receptionist, an embeddable Instant Quote Widget.
- **Target user:** Solo/small-crew pressure washing operator today (Relentless Pressure Wash, the one live company). Multi-tech/team features are built into the schema but intentionally de-prioritized for polish until there are actual employees.
- **Business goals:** Save the owner time weekly, reduce pricing/invoicing mistakes, become a $99–199/mo subscription SaaS for other pressure washing companies within 1–2 years — without building premature multi-tenant management UI now.
- **Maturity:** Production-hardening phase, not new-module phase. Core financial, scheduling, and PDF paths have been through real-database verification, not just code review. One live production company; SaaS subscription/billing not yet built.

## 2. Technical Architecture

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), React, Tailwind, SWR |
| Backend | NestJS (TypeScript), one module per domain |
| Database | PostgreSQL on Railway |
| ORM | Prisma for typed queries; raw `$queryRawUnsafe` for complex joins/reporting — **`appointments` has no Prisma model at all**, managed entirely via raw SQL by deliberate choice |
| Migrations | Hand-numbered SQL files in `backend/prisma/migrations/`, applied via a plain `psql` loop — **not** Prisma's own migrate engine. Must be mirrored into `init-scripts/` (Docker's Postgres init source) — enforced by CI (`scripts/check-migration-sync.sh`, `scripts/check-duplicate-source.sh`, ADR-012). **Two real production outages this cycle were caused by a migration existing in code but never applied to the live Railway database** — CI catches the `init-scripts/` drift, but does not catch "ran locally, never ran on Railway." That gap is still open. |
| Cache | Redis (Railway) — also backs Customer Portal magic links and Quote Widget submission idempotency |
| Hosting | Railway (backend, Postgres, Redis, frontend) |
| Email | Postmark, via one processor (`mail/mail.processor.ts`) + `email_log` table (polymorphic, per-document send history) |
| SMS | Twilio |
| File storage | AWS S3, presigned upload pattern. Public-read required on `branding/` prefix (logos); private/presigned-download for customer photos/docs |
| Auth | JWT access/refresh (`auth/`), email/password + optional Google/Microsoft OAuth (degrades gracefully if unconfigured), email verification, password reset. Multi-company support (`select-company`, `switch-company`, invites) already built, unused today. Customer Portal uses separate magic-link auth. |
| Payments | Stripe — success **and** failure webhook paths both handled (`payment_intent.succeeded` / `payment_intent.payment_failed`); webhook invoice lookups explicitly scoped by `companyId` via PaymentIntent metadata |
| PDF generation | PDFKit, programmatic, one shared service for both Estimates and Invoices. Branding (logo/colors) is read live at render time — never snapshotted into a document. |
| Maps/Geocoding | OpenStreetMap Nominatim (free) — route optimization not built, blocked on a Mapbox account decision. Live production reliability of geocoding never confirmed end-to-end. |
| AI | AI Receptionist (Twilio-integrated call handling, backend built, **never tested against a live call**); AI Assistant (chat, no aggregate-query capability yet) |
| Multi-tenancy | Postgres Row-Level Security on every tenant-scoped table, keyed on `company_id`. The **only** way to set the session variable RLS depends on is `TenantContextService`/`TenantContextInterceptor` (`AsyncLocalStorage`-based). Any tenant-scoped query reached without this context is a bug. |
| Permissions | Backend `PermissionsGuard`/`RolesGuard` are the real boundary. Frontend `<PermissionGate>` is UX convenience only — explicitly documented as not a security boundary. |

## 3. Current Modules

| Module | Status | Key Files | Known Limitations |
|---|---|---|---|
| Dashboard | Complete | `dashboard/` | Map/geocoding live reliability unconfirmed |
| Leads | Not built | Nav stub only | Standalone lead-capture (`leads.service.ts`) exists but bypassed `CustomersService` until a fix this cycle; no dedicated module planned until call/inquiry volume justifies it |
| Customers | Complete | `customers/` | Journey Stage / Customer Intelligence verified correct against real scenarios; "Restore Customer" is UI copy only, no real capability; "Edit Property" doesn't exist (Add/Delete do) |
| Estimates | Complete | `estimates/`, `EstimateForm.tsx`, `CustomerPicker.tsx` | Package Discounts mode toggle (tiered/fixed) is unnecessary complexity; manual convert-to-job endpoint still live alongside auto-creation on accept (ADR-007) — undecided whether to deprecate |
| Scheduling | Complete | `scheduling/` (raw-SQL `appointments`, no Prisma model) | No route optimization; multi-tech assignment model not yet simplified for solo use; calendar drag-reschedule is desktop-only by design (Reschedule modal is the mobile path) |
| Jobs | Complete | `jobs/` | No Archive system yet (full approved spec exists, zero code — see Section 6); Completion Flow now embeds Photos/Chemicals/Equipment inline instead of jump-links |
| Invoices | Complete | `invoices/` | Void blocked when active payments exist; PDF redesigned (logo, prominent Total, Payment Methods, discount-source labeling) and verified by rendering real output |
| Payments | Complete | `payments/` | Stripe success + failure both handled; manual recording supported |
| Customer Portal | Backend complete, frontend unconfirmed | `portal/` | Frontend completeness never directly verified |
| Settings/Branding | Complete for built sections | `settings/` | Logo upload now real (presigned S3); Users & Roles, API Keys still UI-stubbed "Soon" |
| Reports | Complete | `reports/` | `getCustomerAnalytics` LTV independently re-sums invoices instead of reading `Customer.lifetimeValue` — known, unfixed inconsistency |
| Integrations | Complete | `settings/services/integrations.service.ts` | Single page for Stripe/Postmark/Twilio/Anthropic/S3 status + Business Links. **No provider secret ever stored in Postgres** (ADR-011) — Railway env vars only. Verify/Test buttons confirmed to call the right endpoints; never tested against real provider accounts. "Coming Soon" cards (Roof Measurement, Google Maps, QuickBooks, Zapier, Google Calendar, Outlook, CompanyCam) are placeholders only |
| Automations | Complete (backend), invisible (frontend) | `automation/` | Cron-driven, real SMS/email (follow-ups, recurring reminders, review requests); nothing shows a pending automated action before it fires or lets staff cancel one |
| AI Receptionist | Backend complete, unverified live | `receptionist/` | No frontend for behavior settings (greeting/FAQ/hours) despite the DTO existing |
| Service Catalog | Complete | `service-catalog/` | Drag-to-reorder (desktop) / Up-Down buttons (mobile) shipped; reorder endpoint doesn't reject malformed input (self-healing, not validated) |
| Instant Quote Widget | Backend complete + hardened, standalone frontend bundle not built | `public/quote-widget/` | Idempotency, structured logging, typed DTOs all shipped; roof measurement/AI upselling/coupons/analytics explicitly Phase 2+ |
| Review System | Partial | `Customer.reviewReceivedAt` (manual flag) | `ReviewRequest`/`Review` Prisma models exist but are **dead — zero real usage anywhere**. Real decision point: wire up with a real review-platform integration, or remove |
| Customer Intelligence | Complete | `getServiceHistory()` | Verified against 8 real scenarios |

## 4. Database Overview

- Prisma-modeled tables plus `appointments` (real table, zero Prisma model, raw-SQL only). *(Exact model count not independently verified against the real repo — my working copy was confirmed stale mid-session; verify directly with `grep "^model " backend/prisma/schema.prisma` next time this matters.)*
- **Core chain:** `Company` → `CompanyUser`/`User` → `Customer` → `Property` → `Estimate` → `Job` → `Invoice` → `Payment`. Financial documents snapshot their numbers at creation — **never recalculated after creation.**
- **Status vs. business-state separation (ADR-013):** `Job.status` reflects only what happened to the work; a separate, still-unbuilt `archivedAt`/`archivedBy`/`archiveReason` will represent an independent "should this still show in active views" fact — approved spec, not built (Section 6).
- **`Customer.leadStatus`** (`lead`/`active`/`inactive`/`archived`/`churned`) is the only stored relationship field — a real DB CHECK constraint lives inline in the base schema (`init-scripts/00-schema.sql`), not a separate migration; easy to miss if only searching `prisma/migrations/*.sql`. A separate, always-derived "journey stage" (`getJourneyStages()`) is computed live from Estimate/Job status, never stored.
- **Known dead/unused schema:** `ReviewRequest`, `Review` models — real tables, no code path writes to them.
- **Known duplication, not consolidated:** `LEAD_STATUS_STYLES` (badge color map) exists identically in two frontend files.
- **Raw SQL rule:** any `$queryRawUnsafe`/`$executeRawUnsafe` parameter touching a `uuid` or `jsonb` column must be explicitly cast (`$1::uuid`) in the SQL string — Postgres will not infer this.
- **`companies.settings`** is a JSONB blob merged via `jsonb_set` (never overwritten wholesale) for sub-sections: branding, package discounts, lead sources, integration health, business links.

## 5. Completed & Verified Features

Only listing what's been confirmed against real data, not just shipped:

- Multi-tenant auth (register, login, OAuth, email verification, password reset)
- Estimate creation with Package Discounts, service-specific validated fields, inline customer/property creation, draft persistence, discount-value/partial-update bugs fixed
- Accept-estimate → auto-create-job (ADR-001), idempotent
- Auto-assign-to-self on scheduling (first-schedule-only, never overwrites an existing assignment)
- Technician double-booking prevention (`assertNoTechnicianConflict`)
- Appointment cancellation with reason + full audit history, without deleting the row
- Invoice generation with correct discount/tax snapshotting from source estimate (real overcharge bug found and fixed)
- Invoice Void blocked when active payments exist
- Stripe success **and** failure webhook handling, tenant-scoped lookups
- Invoice/Estimate PDF redesign (logo-or-name, prominent Total, Payment Methods, Package-vs-manual discount labeling) — verified by rendering real output
- Customer Intelligence panel — verified against 8 real scenarios
- Review tracking (manual flag + `AutomationLog`-derived request status) — verified across all 4 states, multi-company isolation confirmed
- Lifetime Value: live updates on every payment/refund/void path + historical backfill script; Customer Merge now correctly recalculates it (real bug found and fixed)
- Service Catalog drag/button reordering, self-healing sort-order normalization
- Photo/document upload to S3 (CORS + BigInt-serialization bugs found and fixed)
- Repository integrity CI (`scripts/check-duplicate-source.sh`, `scripts/check-migration-sync.sh`) — proven to catch both failure modes by intentional reintroduction, not just written and assumed

## 6. Current Problems / Technical Debt

| Issue | Type | Notes |
|---|---|---|
| Migrations not confirmed to auto-run on Railway deploy | **Process risk, unresolved** | Caused two real production outages. CI catches local drift, not "never ran on Railway." |
| Version number drift | Process | Separate "CRM Version" tracking vs. `package.json` semver never reconciled — see header warning |
| `getCustomerAnalytics` LTV inconsistency | Bug (minor) | Re-sums invoices instead of reading `Customer.lifetimeValue` |
| `ReviewRequest`/`Review` dead schema | Architecture | Real tables, zero usage — decide: wire up or remove |
| Job Archive System | Missing feature | Full approved spec exists (business rules, screen-by-screen classification, UI copy) — zero code written |
| AI Receptionist bypasses `appointments` | Architecture | Creates jobs directly `scheduled`, no real Appointment row |
| Package Discounts mode toggle | Complexity | Tiered-only would cover both cases |
| No route optimization | Missing feature | Blocked on a Mapbox account decision |
| AI Assistant has no aggregate queries | Missing feature | — |
| Map/geocoding never confirmed live | Unverified | — |
| AI Receptionist never tested on a live call | Unverified | — |
| Customer Portal frontend completeness | Unverified | Backend confirmed real |
| Integrations Verify/Test buttons | Unverified | Confirmed to call correct endpoints; never run against real provider accounts |
| No automation-pending visibility | Missing feature | Nothing shows a pending automated message before it sends, or lets staff cancel it |
| No cancel-job/cancel-appointment UI path for jobs (appointments now have one) | Gap | `cancelled` exists as a job status but has no reachable UI action |
| Invoice Void uses native `confirm()` | Minor, disclosed | Rest of the app uses the shared `ConfirmDialog` |
| No accounting/QuickBooks export | Missing feature | Common competitor table-stakes |

## 7. Development Rules

- **Verify against actual code and a real database before answering or changing anything** — do not assume from memory or from this document alone. Several real bugs this project's history (LTV on merge, discount snapshotting, missing constraints) were only caught this way.
- **Never duplicate business logic or create a second source of truth.** Totals go through `computeDocumentTotals` only. Tenant scoping goes through `TenantContextService` only. One PDF system, one email system, one automation engine, one permission system.
- **Every tenant-scoped query must go through `withTenantContext`** — never call the base Prisma client directly for a tenant-scoped model.
- **Extend existing shared components/services, never build a parallel one-off:** `StatusBadge`/`StatusTimeline`, `ConfirmDialog`, `SettingsSectionShell`, `computeDocumentTotals`, `IntegrationStatusService`.
- **Additive migrations only.** Never edit a shipped migration. Every new migration: write it, copy it verbatim into `init-scripts/`, run `scripts/check-migration-sync.sh`, verify against a freshly-built database, **and confirm it actually ran on the real Railway deploy** (the step that's failed twice).
- **No provider secret ever goes into Postgres** (ADR-011) — Railway env vars only, unless a real bring-your-own-keys decision is made explicitly.
- **Every new tenant-scoped table needs a real RLS policy.**
- **Verify real behavior, not just compile success** — `tsc`/tests passing is necessary but not sufficient. Run real-database scenarios; for PDF/visual work, actually render and inspect the output.
- **No enterprise features, no premature SaaS management UI**, nothing built only because "developers appreciate it."
- **Avoid unnecessary refactoring** — preserve existing structure and naming already established in the file being edited.

## 8. Future Roadmap

**High Priority**
- Fix Railway migration auto-run / verified-deploy step (prevents recurring outages)
- Confirm Map/geocoding works live
- Route optimization (pending Mapbox decision)
- Surface Automations as a real, visible settings page
- Reconcile the two version-number systems

**Medium Priority**
- `getCustomerAnalytics` LTV fix
- Job Archive System (spec already approved — see `PROJECT_HISTORY.md` §17 for the full requirement)
- Real Google review-completion tracking (replace/extend the manual flag)
- AI Assistant aggregate queries
- Job/appointment cancel-UI parity (appointments have it, jobs don't)
- Decide fate of `ReviewRequest`/`Review` dead schema
- Decide fate of the duplicate manual convert-to-job endpoint (ADR-007)

**Nice-to-Have**
- Simplify Package Discounts mode toggle
- Consolidate the duplicated `LEAD_STATUS_STYLES` map
- Invoice `duplicate()`
- Replace Invoice Void's native `confirm()` with `ConfirmDialog`
- QuickBooks export
- Instant Quote Widget's actual embeddable frontend bundle (backend is done)

**Explicitly Deferred (do not build yet)**
- Auth/session-lifetime redesign (ADR-referenced, deferred until real multi-user SaaS prep begins)
- Team/technician management UI, multi-company admin UI, advanced RBAC, subscription billing, plugin/feature-flag architecture
