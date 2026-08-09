# Renovo CRM — Project Context

*Lean reference for Claude sessions. Full build history, ADRs, and past bug postmortems: `PROJECT_HISTORY.md`.*

## 1. Product Overview

- **What it is:** Multi-tenant SaaS CRM purpose-built for pressure washing businesses — customers, properties, estimates, jobs, scheduling, invoicing, payments, self-service customer portal, AI phone receptionist.
- **Target user:** Solo/small pressure washing operator today (Leo, Relentless Pressure Wash). Built to become a $99–199/mo subscription SaaS for other pressure washing companies within 1–2 years.
- **Business goals:** Save the owner time weekly, reduce pricing/invoicing mistakes, win more jobs (instant quoting, AI receptionist), be genuinely better for this trade than generalist FSM tools (Jobber, Housecall Pro) or the trade-specific niche tools (ServiceMonster, QuoteIQ).
- **Maturity:** Pre-launch, actively developed, one production deployment (single real company). Core financial and scheduling paths are verified and hardened. Not yet handling real subscription billing or multiple paying companies.

## 2. Technical Architecture

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router), React, Tailwind, SWR for data fetching |
| Backend | NestJS (TypeScript) |
| Database | PostgreSQL, hosted on Railway |
| ORM | Prisma — **not** 100% of tables are modeled; some (e.g. `appointments`) are managed entirely via raw `$queryRaw`/`$executeRaw` by deliberate choice |
| Cache/Queue | Redis (Railway) |
| Hosting | Railway (backend service, Postgres, Redis); frontend also Railway |
| Email | Postmark |
| SMS | Twilio |
| File storage | AWS S3 (presigned upload pattern; public-read needed on `branding/` prefix for logos, private for customer photos/docs) |
| Auth | Custom JWT-based (NestJS), email/password + Google/Microsoft OAuth, email verification, password reset, multi-company support (`select-company`, `switch-company`, invites) already built but unused (solo company today) |
| Payments | Stripe (Customer Portal payment flow) |
| PDF generation | PDFKit, programmatic (no HTML template engine), one shared service for both Estimates and Invoices |
| Maps/Geocoding | OpenStreetMap Nominatim (free, no key) — route optimization not built, blocked on a Mapbox account decision |
| AI | Custom AI Receptionist (phone answering, job booking) and AI Assistant (chat) — Assistant currently has no aggregate-query capability |

## 3. Current Modules

| Module | Status | Key Files | Known Limitations |
|---|---|---|---|
| Dashboard | Complete | `backend/src/dashboard`, `frontend/app/page.tsx` (implied) | Map/geocoding live reliability never confirmed end-to-end in production |
| Leads | Partial | `backend/src/leads` | Frontend nav shows "SOON" — backend exists, minimal dedicated UI |
| Customers | Complete | `backend/src/customers`, `frontend/app/customers` | Journey Stage/Customer Intelligence verified correct; real usage value still unconfirmed |
| Properties | Planned | — | Frontend nav "SOON," intentionally deferred |
| Estimates | Complete | `backend/src/estimates`, `frontend/components/estimates/EstimateForm.tsx` | Package Discounts mode toggle (tiered/fixed) is unnecessary complexity, flagged for simplification |
| Scheduling | Complete | `backend/src/scheduling` (raw-SQL `appointments` table, not a Prisma model) | No route optimization; auto-assign-to-self shipped and verified |
| Jobs | Complete | `backend/src/jobs` | — |
| Invoices | Complete | `backend/src/invoices` | Financial-integrity snapshot-on-generation fix shipped (was a real overcharge bug); PDF redesigned and verified |
| Payments | Complete | `backend/src/payments` | Additive-only, no gaps found |
| Customer Portal | Complete | `backend/src/portal` | Estimate approval, invoice view, Stripe payment all working |
| Settings/Branding | Complete | `backend/src/settings` | Logo upload now real (presigned S3, reuses customer-photo pattern) |
| Reports | Complete | `backend/src/reports` | `getCustomerAnalytics` LTV independently re-sums invoices instead of reading `Customer.lifetimeValue` — known, unfixed inconsistency |
| Automations | Complete (backend), Invisible (frontend) | `backend/src/automation` | Real, working (estimate follow-up, recurring reminders, review requests) but no real settings visibility page — nav shows "SOON" |
| AI Receptionist | Complete | `backend/src/receptionist` | Creates jobs directly `scheduled`, bypasses the `appointments` table entirely (pre-existing, not yet fixed) |
| AI Assistant | Partial | `backend/src/ai` | No aggregate-query capability (can't answer "how much did I make this month") |
| Review System | Partial | `Customer.reviewReceivedAt` (manual flag) | `ReviewRequest`/`Review` Prisma models exist but are **dead — unused anywhere in the app**. Real decision point: wire up properly with a review-platform integration, or remove |
| Customer Intelligence | Complete | `customers.service.ts: getServiceHistory()` | Verified against 8 real scenarios |
| Equipment / Chemical Tracking | Partial | `JobEquipmentUsage`, `JobChemicalUsage` (junction tables only, no standalone catalog models) | Not deeply audited this project cycle |
| Integrations | Partial | `backend/src/settings/services/integrations.service.ts` | Google/Microsoft OAuth, Stripe, Postmark, Twilio wired; no accounting (QuickBooks) export |

## 4. Database Overview

- **36 Prisma models.** Multi-tenant via `companyId` on every tenant-scoped table, enforced with Row-Level Security via a `withTenantContext` wrapper — **every raw SQL query must go through this**, never a bare `$queryRaw` outside it.
- **Core chain:** `Company` → `CompanyUser` (join to `User`, role-scoped) → `Customer` → `Property` → `Estimate` → `Job` → `Invoice` → `Payment`. Financial documents (`Invoice`) snapshot their numbers at creation from the source `Estimate` — **never recalculated after creation.**
- **`appointments` table exists but has no Prisma model** — managed entirely via raw SQL in `scheduling.service.ts`. Do not assume `prisma.appointment` works.
- **Known schema gaps:**
  - `ReviewRequest`/`Review` models — real tables, zero real usage anywhere in the app.
  - Raw `$queryRawUnsafe` calls require explicit Postgres casts (`::uuid`, `::jsonb`, `::uuid[]`) — a standing, repeatedly-enforced project rule.
  - **Every new migration must be copied into `init-scripts/` and verified with `scripts/check-migration-sync.sh`, and confirmed to actually run against production after deploy** — two real production outages this cycle were caused by a migration existing in code but never applied to the live database. Railway is not currently confirmed to auto-run migrations on deploy; this needs a real fix.

## 5. Completed & Verified Features

Only listing what's been confirmed working against real data, not just shipped:

- Multi-tenant auth (register, login, OAuth, email verification, password reset) — confirmed via direct code read, not a demo-only system
- Estimate creation, Package Discounts, service-type-specific required-field validation, Instant Quote Widget
- Job creation from accepted estimate (idempotent), auto-assign-to-self on scheduling (verified: first-schedule-only, never overwrites an existing assignment)
- Invoice generation with correct discount/tax snapshotting from source estimate (real bug found and fixed)
- Invoice/Estimate PDF: centered logo or company name, prominent Total, redesigned line-item layout, Payment Methods (Zelle via real company phone, credit card fee notice), Package Discount vs. Discount labeling — all verified by rendering real output, not just code review
- Customer Intelligence panel (Last Service, LTV, Balance Due, Open Estimates/Invoices, Jobs Completed, Avg Job Value, Recommended Upsell, Overdue flag) — verified against 8 real scenarios
- Review tracking (manual mark-as-reviewed; request-sent/failed derived from `AutomationLog`)
- Photo/document upload to S3 (CORS + BigInt-serialization bugs found and fixed)
- Property auto-select on Estimate creation when a customer has exactly one property

## 6. Current Problems / Technical Debt

| Issue | Type | Notes |
|---|---|---|
| Migrations not confirmed to auto-run on Railway deploy | **Process/Deploy risk** | Caused two real production outages this cycle. Needs a real fix — a deploy-time migration step. |
| `getCustomerAnalytics` LTV inconsistency | Bug (minor) | Re-sums invoices instead of reading `Customer.lifetimeValue` |
| `ReviewRequest`/`Review` dead schema | Architecture | Real tables, zero usage — decide: wire up or remove |
| AI Receptionist bypasses `appointments` table | Architecture | Creates jobs directly `scheduled`, no real Appointment row |
| Package Discounts mode toggle | Complexity | Tiered-only would cover both cases |
| No route optimization | Missing feature | Blocked on a Mapbox account decision from the owner |
| AI Assistant has no aggregate queries | Missing feature | — |
| Map/geocoding never confirmed live | Unverified | Flagged repeatedly, never confirmed end-to-end in production |
| No accounting/QuickBooks export | Missing feature | Common competitor table-stakes |

## 7. Development Rules

- **Verify against actual code before answering or changing anything** — do not assume a file's contents from memory or from this document alone.
- **Never duplicate business logic or create a second source of truth.** Financial calculations are computed once (`computeDocumentTotals`) and never re-derived elsewhere.
- **Every new query/table must be `companyId`-scoped.** No multi-tenant management UI yet — don't build one unless asked.
- **Reuse existing services and patterns** (e.g., the presigned-S3-upload pattern, the Settings JSONB pattern, the Invoice-snapshots-Estimate pattern) rather than inventing parallel ones.
- **Every new migration:** write it in `backend/prisma/migrations/`, copy it verbatim into `init-scripts/`, run `scripts/check-migration-sync.sh`, and verify against a real, freshly-built database before considering it done.
- **Verify real behavior, not just compile success** — test suite + `tsc` passing is necessary but not sufficient; run real-database scenarios and, for visual/PDF work, actually render and inspect the output.
- **Avoid unnecessary refactoring.** Preserve existing structure and naming conventions already established in the file being edited.
- **No enterprise features, no premature SaaS management UI, no features "developers appreciate" but owners don't use.**

## 8. Future Roadmap

**High Priority**
- Fix Railway migration auto-run (prevents recurring production outages)
- Confirm Map/geocoding works live
- Route optimization (pending Mapbox decision)
- Surface Automations as a real, visible settings page

**Medium Priority**
- `getCustomerAnalytics` LTV fix
- Real Google review-completion tracking (replace/extend manual flag)
- Recurring Services as a visible module
- AI Assistant aggregate queries
- Weather-aware scheduling (Weather service already exists)

**Nice-to-Have**
- Simplify Package Discounts mode toggle
- Invoice `duplicate()`
- QuickBooks export
- Equipment/Chemical Tracking deeper audit and polish

**Explicitly Deferred (do not build yet)**
- Team/technician management, multi-company admin UI, advanced RBAC, subscription billing, plugin/feature-flag architecture


## Addendum — Customer Portal Phase 1 (shipped)

**Architecture decision reversed mid-project, deliberately:** a separate `portal-frontend` Next.js app was seriously considered and then correctly rejected — one deployment, one repo, one CI/CD pipeline outweighs the marginal isolation benefit, especially given this project's own history of migration/deploy-sync outages being made worse by multiple deploy targets, not fewer.

**A real constraint discovered during implementation, not before:** the originally-specified `(staff)`/`(portal)` route-group structure was assessed and found genuinely risky — this entire frontend uses relative imports (`../../lib/...`) everywhere, not the `@/` alias already configured in `tsconfig.json`. Moving every existing staff route into a `(staff)` group would have shifted hundreds of files' relative import depth, with no safe way to verify that scale of change within one session. Built genuine functional isolation a different way instead: portal pages live under a real path segment (`app/portal/...`, not a parenthetical group), and `AuthProvider` — which wraps the whole app — explicitly bails out on any `/portal/` route before its staff-specific effects (the `/auth/me` fetch, the redirect-to-staff-login effect) can run. Zero existing staff files were touched to achieve this; only `middleware.ts` and `auth-context.tsx` were modified, both surgically, both verified to leave staff behavior byte-identical.

**Backend — one true BFF endpoint:** `GET /portal/dashboard` composes `getEstimates()`, `getInvoices()`, `getServiceHistory()`, `CompanyContextService.getCompanyAndBranding()`, and one genuinely new read-only query (`getUpcomingAppointments()`, reusing the exact raw-SQL style already established in `SchedulingService`). Zero duplicated business logic, zero duplicated calculations — `outstandingBalance` sums the real `balanceDue` generated column rather than re-deriving it. Verified against a real database with a hand-calculable scenario; every figure matched exactly. Multi-company isolation confirmed directly: a query with the correct `customerId` but wrong `companyId` returns nothing.

**Real bugs found and fixed during implementation, not shipped:** the Verify page's redirect target, the Dashboard's logout target, and the "request a new link" fallback link all initially pointed at non-existent bare paths (`/dashboard`, `/login`) instead of the real `/portal/...`-prefixed routes. Fixed by storing the company slug alongside the portal session token (`getPortalCompanySlug()`), so every redirect can correctly target that specific company's login page — not just the dashboard's own happy path.

**Deployment:** confirmed directly against Railway's own documentation — multiple custom domains are supported per service, so `portal.renovocrm.com` can be added as a second custom domain on the existing frontend service. Not yet added; documented as the one remaining manual step before this can go live.

**Explicitly deferred to Phase 2, per approved scope:** Estimates/Invoices/Payments/Photos/Service Requests/AI Chat UI. The backend for all of these already exists (see the original Customer Portal audit) — Phase 2 is UI-only work against an already-proven API.

## Addendum — Consistent PDF & Email Filenames (shipped)

**Four independent, hardcoded filename formats found and eliminated,**
confirmed by direct search, not assumed: `EstimatesService.generatePdf()`,
`InvoicesService.generatePdf()`, and two inline formats in
`portal.controller.ts` (estimate view, invoice view). None matched the
requested format, and critically none of the invoice paths ever checked
for a source estimate at all — "created from an estimate" was a real,
missing capability, not just an inconsistency.

**One shared, pure helper:** `common/utils/pdf-filename.util.ts` —
`generateEstimateFilename()` and `generateInvoiceFilename()`. No DB
access, no company/tenant logic, deterministic. Every one of the four
call sites (staff Estimate PDF, staff Invoice PDF, Portal Estimate PDF,
Portal Invoice PDF) now calls this same helper — confirmed zero
remaining hardcoded `Estimate-${...}`/`Invoice-${...}` formats anywhere
in the backend by direct search.

**Email attachments needed zero separate fix** — both `sendEmail()`
methods already call the same `generatePdf()` internally and reuse its
returned filename directly for the attachment. Fixing PDF generation
correctly fixed email automatically, confirmed by reading the actual
call sites, not assumed.

**No new query introduced** — the source estimate's number is fetched
by extending the two *existing* invoice queries (one additional LEFT
JOIN column in the staff raw-SQL query, one additional `include` on the
portal's Prisma query) rather than a second round-trip.

**Verified against a real database**, not simulated: an invoice
generated from an estimate correctly produced `EST-1025` as its source
number via the exact fixed query; a standalone invoice (no estimate)
correctly returned null. The actual filename helper was then run
directly against both real cases plus a deliberate invalid-character
edge case — all three matched the requested spec exactly:
`Quote EST-1025.pdf`, `Quote EST-1025 - Invoice INV-1048.pdf`,
`Invoice INV-1049.pdf`.

**Frontend needed no changes at all** — confirmed by search that this
app has zero independent filename-generation logic; both staff and
portal downloads rely entirely on the browser respecting the backend's
`Content-Disposition` header, meaning the four backend fixes are the
complete, exhaustive fix.

## Addendum — OAuth Graceful Failure + Google Sign-In Enablement (shipped)

**The real bug, confirmed precisely, not assumed:** `/auth/google` (and `/auth/microsoft`) returned a raw, opaque 500 when unconfigured. Root cause: an earlier fix already stopped the whole app from crashing at boot when `GOOGLE_CLIENT_ID` is missing (by conditionally skipping `GoogleStrategy` construction), but left the *routes* themselves always reachable, still always running `AuthGuard('google')` — which throws an unhandled "Unknown authentication strategy" error the moment that strategy was never registered. The boot-crash was fixed; this route-level crash was not, and it's the direct, inevitable consequence of the same root cause.

**The fix:** `OAuthConfiguredGuard`, placed *before* `AuthGuard(provider)` in the guard chain (NestJS runs guards in array order) — checks the same env var `auth.module.ts` already uses to decide whether to construct the strategy, and throws a clean `ServiceUnavailableException` (503, real message) if it's missing, so `AuthGuard` never gets a chance to fail on an unregistered strategy. Confirmed valid, official NestJS usage (mixing a guard instance with a guard class reference in one `@UseGuards()` call) directly against NestJS's own source. Verified directly: unconfigured → clean 503 with a real message; configured → passes through unchanged.

**Frontend:** new `GET /auth/oauth-providers` (public, reuses the exact same env-var signal, not a second source of truth) tells the login/register pages which buttons are safe to show. New `OAuthButtonsSection` component replaces the previously-unconditional buttons — renders nothing at all (not even the "OR" divider) when neither provider is configured, rather than showing a button guaranteed to fail.

**Existing account-linking logic (`AuthService.handleOAuthLogin`) was audited, found already correct, and left untouched** — a genuinely complete, SaaS-ready implementation: a brand-new Google identity gets its own brand-new Company (never hardcoded, never assumes one company), an existing password account with a matching email gets the OAuth identity *linked* (never duplicated — backed by a real DB unique constraint on `(provider, providerAccountId)`, not just application logic), and a user in multiple companies gets the same company-selection flow password login already uses. Verified all three scenarios against a real database, including confirming the unique constraint genuinely rejects a duplicate link attempt at the database level.

**Google Cloud + Railway configuration required to complete real Google sign-in** — see chat for the full step-by-step; not yet completed as of this addendum. Real callback URL confirmed from code + the actual deployed domain (not guessed): `https://renovo-crm-system-production.up.railway.app/auth/google/callback`.

**Microsoft:** same graceful-failure fix applied (identical bug, identical pattern) — full Microsoft OAuth implementation itself explicitly out of scope for this pass, per approved scope.

## Addendum — Manual & Historical Payment Recording (shipped)

**Found already ~95% built, from an earlier session.** The audit confirmed `POST /invoices/:invoiceId/payments`, `PaymentsService.recordPayment()`, and the `PaymentsSection.tsx` UI already existed, complete and correct — cash/check/zelle/other methods, reference numbers, notes, partial-payment accumulation, overpayment rejection, draft/void-invoice blocking, LTV updates, all in the same transaction. The schema's `Payment.paymentDate` column already existed too, with a migration comment explicitly anticipating this exact use case ("for cash/check is often entered a day or more after the fact"). **The only gap was the frontend form had no date input field at all.**

**The real, larger finding: every revenue-reporting query used `processedAt` (always "now" at recording time), never `paymentDate`.** A backdated manual payment would have shown up as revenue on the day it was *entered*, not the day it actually happened. Re-auditing against the current code (not just the original pass) found this in more places than first identified: `reports.service.ts` (month-to-date revenue, daily payment trend), `dashboard.service.ts` (today's revenue, recent payments), and `customers.service.ts` (Customer Intelligence payment history, the customer activity timeline) — six total call sites, fixed with the same `COALESCE(paymentDate, processedAt)` principle applied consistently, never blindly.

**Confirmed safe by tracing every payment-creation path, not assumed:** the Stripe webhook path (`portal.controller.ts`) never sets `paymentDate` — only `processedAt`. This makes the fix provably a no-op for every Stripe payment, past and future; only manually-recorded payments are affected.

**Two Prisma-specific technical notes, since its typed query builder can't express a computed COALESCE:** `getTodaysRevenue` uses an equivalent OR-based where clause; `getRecentPayments` and `getServiceHistory`'s payment list fetch their (bounded) datasets and sort by the effective date in application code, rather than introducing raw SQL into otherwise pure-Prisma files.

**Verified against real data, not just code review:** set up the exact two scenarios from the spec (a backdated $500 March cash payment, a $750 April job paid in two historical installments) and confirmed, with a direct side-by-side comparison: the old query would have shown $1,250 as "this month's revenue"; the fixed query correctly shows $0 for the current month and correctly attributes $500 to March 15 in the daily trend. Also verified: invoice balance/status, customer LTV, multiple payments per invoice, a simulated Stripe payment still counts via the `processedAt` fallback, and company isolation (a second company's payment never appeared in the first company's query despite matching every other filter). `payments.service.ts` (void, refund, overpayment rejection) was confirmed completely untouched by this feature.
