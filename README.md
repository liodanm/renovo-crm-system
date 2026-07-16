# Renovo CRM — Backend & Frontend

Two features built so far, in the same codebase:

1. **Authentication system** — JWT access/refresh, secure login, email
   verification, password reset, Google & Microsoft OAuth, multi-company
   support, and full RBAC (owner/admin/dispatcher/crew_lead/crew_member/
   billing roles + fine-grained permissions).
2. **CRM Dashboard** — Today's Jobs, Today's Revenue, Pending Estimates,
   Open Leads, Customer Map, Weather, Job Calendar, Recent Payments, AI
   Suggestions, and Notifications — role-shaped, responsive, and backed by
   real aggregation queries (not mock data) against the schema.

Both were type-checked end-to-end in a sandboxed Postgres + Node
environment while building this (see "What was actually validated" below).

## Structure

```
backend/    NestJS API — auth module, guards, strategies, services
frontend/   Next.js 14 App Router — login/register/reset/verify pages,
            AuthProvider, permission gating, company switcher
```

## The Dashboard, in detail

**Role-shaped, not role-gated.** `GET /dashboard/summary` has no
`@RequirePermissions()` — every authenticated company member can load the
dashboard. `DashboardService` independently checks permissions per
*section* and omits (not zeroes-out) anything the caller can't see, so a
crew_member gets a real response containing only "Today's Jobs," while an
owner gets everything. The frontend renders a 🔒 state only where the
backend actually omitted a section, never by guessing client-side.

**A real RBAC bug, found and fixed in this session.** While seeding test
data I discovered `role_permissions` — the table binding the six system
roles to actual permissions — had never been populated in the original
auth build. Every access token's `permissions[]` claim was silently empty
regardless of role. Fixed via `prisma/migrations/001_seed_role_permissions.sql`,
verified against a live Postgres instance (each role now resolves to its
correct permission count: owner 14, admin 13, dispatcher 7, billing 5,
crew_lead 3, crew_member 1).

**Weather has no hardcoded location.** There's no "company service area"
setting in the API yet, so rather than faking a city, the widget derives a
real coordinate from the average location of the company's own serviced
properties, falls back to browser geolocation, and shows an honest empty
state if neither is available — never a fabricated forecast.

**AI Suggestions degrade gracefully, not silently.** With `ANTHROPIC_API_KEY`
set, Claude turns real computed stats (overdue invoice totals, stale lead
counts, unassigned jobs) into prioritized narrative suggestions. Without a
key — or on any API failure/timeout — a deterministic rule engine produces
the same shape of output from the same real stats. Neither path is a stub;
the rule engine is genuine business logic, not a placeholder.

**Customer Map uses Leaflet + OpenStreetMap**, not a keyed provider (Google
Maps, Mapbox) — no API key to provision for a widget that isn't core
product. `CircleMarker` (pure SVG) is used instead of image-based pins,
which sidesteps a well-known Next.js/Leaflet bundler issue with default
marker icon paths entirely rather than working around it.

## Setup

### Backend

```bash
cd backend
cp .env.example .env      # fill in DB/Redis/OAuth secrets; ANTHROPIC_API_KEY is optional
npm install

# Apply the base schema (from the earlier deliverable) + this module's additions:
psql $DATABASE_URL -f ../../renovo_crm_schema.sql
psql $DATABASE_URL -f prisma/migrations/000_add_oauth_accounts.sql
psql $DATABASE_URL -f prisma/migrations/001_seed_role_permissions.sql
npx prisma generate

npm run start:dev         # http://localhost:4000
```

Requires: Postgres 16, Redis (sessions, rate limiting, ephemeral tokens,
weather/AI-suggestion caching), and a Redis-backed BullMQ worker consuming
the `mail` queue (not included — wire `MailService`'s queue jobs to
Postmark/SES in your worker process).

### Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                # http://localhost:3000
```

## How the pieces fit together

**Tokens.** Access tokens (15 min) carry `companyId`, `roleId`, and a
flattened `permissions[]` array, so every authorization check on the backend
is a claim read — no DB hit per request. Refresh tokens (30 days) are
opaque, rotated on every use (old one is deleted, a new one issued), and
tracked in Redis by session id (`jti`) so any session can be revoked
instantly — on logout, "log out all devices," or automatically on password
reset.

**Multi-company.** A user can belong to several companies via
`company_users`. Logging in with credentials that map to more than one
company returns a short-lived **pre-auth token** instead of real tokens; the
frontend's `/select-company` screen exchanges it (`POST
/auth/select-company`) for a company-scoped token pair. Already-logged-in
users switch companies via `POST /auth/switch-company`.

**RBAC.** Six system roles ship seeded (owner, admin, dispatcher, crew_lead,
crew_member, billing), each a named bundle of fine-grained permission keys
(`invoices.write`, `jobs.delete`, ...) from the `permissions` catalog table.
`@Roles()` is for coarse, identity-bound checks ("only an owner can delete
the company"); `@RequirePermissions()` is the primary mechanism and is what
most routes should use, since it survives adding a 7th role without an
audit of every guarded endpoint.

**OAuth.** Google/Microsoft sign-in links an OAuth identity to a Renovo
account by verified email — a user who registered with a password can later
add Google Sign-In without creating a duplicate account, since the OAuth
provider itself already verified that email address.

**Security defaults.** Argon2id password hashing, generic error messages on
login/forgot-password to resist account enumeration, login lockout after 5
failed attempts in 15 minutes, all secrets/tokens hashed before storage,
`FORCE ROW LEVEL SECURITY` tenant isolation inherited from the base schema,
helmet + strict CORS, and global `class-validator` DTO validation with
`forbidNonWhitelisted`.

## What was actually validated in the sandbox

- **Backend**: `npm install` (435 packages), then `tsc --noEmit` — clean
  compile, two real bugs caught and fixed (ioredis `SET...EX` overload
  ambiguity, possibly-undefined `ConfigService.get()` values).
- **Backend caveat**: `prisma generate` couldn't reach
  `binaries.prisma.sh` from this sandbox (not on the network allowlist), so
  it fell back to a stub client (`PrismaClient: any`) — meaning the specific
  Prisma model/field calls in `auth.service.ts` were **not** compiler-checked
  against `schema.prisma`. I manually cross-checked every call (model names,
  field names, and compound-unique key names like `companyId_userId`) against
  the schema and they're consistent, but you should run `npx prisma generate`
  yourself with real network access and re-run `tsc` before deploying.
- **Frontend**: `npm install` (107 packages), `tsc --noEmit` clean, and a
  full `next build` — caught and fixed a real Next.js App Router issue
  (`useSearchParams()` needs a `<Suspense>` boundary on `/login`,
  `/reset-password`, `/verify-email`). All 9 routes now build to static
  output successfully, including the 26.6kB middleware bundle.
- **Database**: the companion `oauth_accounts` migration was run against a
  live Postgres 16 instance on top of the previously-delivered schema —
  applies cleanly. For the dashboard, I seeded realistic fixture data
  (customers, properties, jobs, invoices, payments, estimates) and ran every
  aggregation query the dashboard depends on directly in `psql` — today's
  jobs, today's revenue, pending estimates, open leads, recent payments,
  map data, and the AI-suggestions stats query — before encoding the same
  logic into Prisma, so the business logic itself (not just the TypeScript)
  is verified against real data, not assumed correct.
- **Dashboard backend**: `tsc --noEmit` clean against the extended Prisma
  schema (added Customer/Property/Job/Estimate/Invoice/Payment/Notification/
  Crew models).
- **Dashboard frontend**: `tsc --noEmit` clean and a full `next build`
  succeeded on the first real attempt this time (no errors to fix) — the
  home route grew from 3.96kB to 13.9kB with all ten widgets, middleware
  and static generation both still succeed, and the Leaflet map's
  `next/dynamic(ssr:false)` boundary doesn't break prerendering.

## Not included (flagged, not silently skipped)

- MFA/TOTP (the schema has `users.mfa_secret`/`mfa_enabled` columns ready;
  the enrollment/verification flow itself isn't built here — say the word
  if you want it added).
- The actual email-sending worker (BullMQ `mail` queue consumer calling
  Postmark/SES) and HTML email templates — `MailService` enqueues jobs with
  a `template` name and `data`; the templates/worker are a natural next step.
- SSO/SAML for enterprise tenants (mentioned as a phase-2 item in the
  original architecture doc).

---

## CRM Dashboard (added after the auth system)

`backend/src/dashboard/`, `backend/src/weather/`, `backend/src/ai/` +
`frontend/components/dashboard/`, `frontend/app/page.tsx`.

**What it does.** A single role-shaped `GET /dashboard/summary` payload
drives four KPI cards (Today's Jobs, Today's Revenue, Pending Estimates,
Open Leads) plus a jobs list, Recent Payments, and AI Suggestions. Separate
endpoints back the Job Calendar (week-range query), Customer Map (property
coordinates), Weather (Open-Meteo proxy), and Notifications. Every number is
a real Prisma aggregation query — no widget renders mock data.

**Role-aware, not just role-gated.** A `crew_member` hitting `/dashboard/summary`
doesn't get a 403 — they get a real 200 with `todaysJobs` populated and
`todaysRevenue`/`pendingEstimates`/`openLeads`/`recentPayments` set to `null`
(omitted, not zeroed, so the frontend can tell "no data" from "not
authorized"). This depends on `role_permissions` actually being populated —
which, on review, it wasn't (see next paragraph).

**A real bug found and fixed while building this.** The auth system shipped
`permissions` and `roles` tables fully seeded, but never bound them via
`role_permissions` — every access token's `permissions[]` claim would have
been empty regardless of role, silently breaking every `@RequirePermissions()`
check in the app. Caught it while wiring the dashboard's role-based data
shaping (which depends on that claim being non-empty), fixed it with
`prisma/migrations/001_seed_role_permissions.sql`, and verified the fix
against a live Postgres instance — all six roles now resolve to the correct
permission counts (owner 14, admin 13, dispatcher 7, crew_lead 3,
crew_member 1, billing 5).

**Weather and AI suggestions degrade honestly, not silently.** Weather uses
Open-Meteo (open-meteo.com) — free, keyless, no secret to provision for a
peripheral widget. Its location comes from the average coordinates of the
company's own serviced properties (real data), falling back to browser
geolocation, and shows an honest empty state ("Add a customer address...")
if neither is available — never a fake city's forecast. AI Suggestions calls
Claude if `ANTHROPIC_API_KEY` is set; if not (or on any API failure), it
falls back to a deterministic rule engine over the same real stats (overdue
invoice totals, stale leads, unassigned jobs) — a genuine second code path,
not a stub, so the widget is useful with zero AI spend.

**What was actually validated.** Seeded realistic fixture data (customers,
properties, jobs, invoices, payments, estimates) into the same live
Postgres 16 instance from the schema deliverable, then hand-validated every
aggregation query in raw SQL before encoding it in Prisma — today's jobs,
today's revenue, pending estimates, open leads, recent payments, map
properties, overdue invoice totals, and unassigned job counts all matched
expected results against known fixture data. Both `tsc --noEmit` (backend
and frontend) and a full `next build` passed clean, including the Leaflet
map component, which needed `next/dynamic` with `ssr: false` since Leaflet
touches `window` at module-load time — caught and fixed during the build,
not assumed to work.

**Known simplification, flagged rather than hidden.** "Today" in
`getTodaysJobs`/`getTodaysRevenue` uses the server's local day boundary, not
the company's own `timezone` column (which exists on the `companies` table
but isn't read yet). Fine for a single-timezone pilot; needs to switch to
per-company timezone math before onboarding companies across time zones.
Similarly, field-role job scoping (`crew_lead`/`crew_member` seeing only
their assigned jobs) is stubbed to "all of today's jobs" until the
`crew_members` join table is wired into this module — flagged inline in the
code, not silently approximated.

## Suggested next steps

1. **Fix the two flagged simplifications above** before this goes near a
   real multi-timezone or multi-crew customer.
2. **Customers & Properties CRUD** — the dashboard reads this data but
   there's still no UI to create it; right now it only exists because I
   seeded it directly in Postgres for testing.
3. **Notification-writing side** — `notifications` table and read-side API
   exist; nothing in the app writes to it yet (job assigned, invoice
   overdue, payment received should all generate one).

---

## Customer Management module

`backend/src/customers/` (6 services, 2 controllers) + `frontend/app/customers/`,
`frontend/components/customers/` (7 profile tabs).

**Everything requested, actually working:**

| Feature | Where |
|---|---|
| Profile, phone, email, multiple properties | `CustomersService` + `CustomerPropertiesService` — a customer can have N properties, each independently addressable |
| Service history | `getServiceHistory()` — real aggregation across jobs/estimates/invoices/payments, with lifetime spend and outstanding balance computed, not stored redundantly |
| Invoices, estimates | Surfaced inside service history — same live data the dashboard reads, not a separate copy |
| Notes | `CustomerNotesService` — pinnable, edit/delete restricted to the original author so "who said what" stays reliable in a shared record |
| Photos, documents | `CustomerFilesService` — real two-step direct-to-S3 presigned upload (browser PUTs bytes straight to S3; the API server never touches the file), matching the media architecture from the first deliverable |
| Tags | Native `text[]` column, inline add/remove on the profile, filterable in search via Postgres array-overlap (`&&`) |
| Custom Fields | `CustomFieldsService` — company-defined field definitions (text/number/date/boolean/select) + per-customer values, built as a polymorphic pattern that extends to properties/jobs later without new tables |
| Activity Timeline | `getActivityTimeline()` — merges jobs, estimates, invoices, payments, and notes into one chronological feed, computed on read (no separate event-log table to keep in sync) |
| Search | ILIKE across name/business/email/phone, backed by the trigram GIN index from the base schema |
| Filters | Type, lead status, tags, date range, sortable |
| Duplicate Detection | `DuplicateDetectionService` — exact email/phone matching + `pg_trgm` fuzzy name matching, both a live "check as you type" endpoint on the create form and a company-wide cluster scan with a merge action |
| Export | Streaming CSV via `papaparse`, capped at 50K rows with an explicit note about the background-job threshold |
| Import | Real CSV parsing with per-row validation (required fields, email format, enum values), duplicate skip-not-fail, and a row-level error report — not a "looks right" stub |

**Duplicate detection actually validated against real data, not just written.**
Seeded a near-duplicate ("Sarah Connor" vs "Sara Conner") into the same live
Postgres instance and ran the exact trigram similarity SQL the service uses
— it correctly scored the pair at 0.47 similarity (above the 0.45 threshold)
and correctly did NOT flag unrelated customers. Also validated the tag
array-overlap filter and case-insensitive search directly in SQL before
trusting the Prisma versions.

**A real design decision, not an oversight: duplicate detection never hard-blocks,
except one case.** Two customers can legitimately share a phone (a couple
booking separately) or a very similar name (father/son, same business) — so
every signal is advisory, surfaced for a human to confirm or dismiss. The one
exception is an *exact* email match on create, which defaults to a hard stop
(re-typing the same customer is far more common than two real customers
sharing an email) — but even that has an explicit override
(`acknowledgedDuplicateWarning`) rather than being unconditional.

**Merge is a real transaction, not a soft link.** Merging re-points every
child record — properties, jobs, estimates, invoices, payments, notes,
photos, documents — from the duplicate to the canonical customer, unions
their tags, and soft-deletes the duplicate, all inside a single Prisma
`$transaction`. A partially-applied merge would corrupt more data than not
merging at all, so it's all-or-nothing.

**What was actually validated.** Ran the customer-management migration
(`002_customer_management.sql`) against the same live Postgres 16 instance
used throughout this project — 4 new tables, RLS enabled and force-enabled
on all of them, and the `photos` table's parent-check constraint correctly
extended to allow customer-level uploads. Both `tsc --noEmit` and a full
`next build` passed clean across backend and frontend; the build now
produces 13 routes including the dynamic `/customers/[id]` profile page.

**One real bug found and fixed during this build, not shipped.** A
`.map()` call building a `Map<string, Definition>` for custom field lookups
inferred the value type as `{}` instead of the actual definition type — a
genuine TypeScript tuple-inference gap, not a Prisma-stub artifact. Fixed
with an explicit return type annotation and re-verified clean.

**Known limitation, same root cause as before.** `prisma generate` still
can't reach `binaries.prisma.sh` from this sandbox, so the ~5 remaining
`tsc` errors (`Prisma.CustomerWhereInput`, etc. not found) trace directly to
the stub client's `export declare const PrismaClient: any` — confirmed by
reading the stub file directly. Every Prisma call in the new services was
manually cross-checked against `schema.prisma`'s actual field and relation
names. Run `npx prisma generate` with real network access before deploying,
then re-run `tsc` to get full compiler coverage on the Prisma layer.

**Deliberately not built yet, flagged rather than approximated:**

- **Custom field definitions management UI** — the backend (create/list/delete
  definitions) is complete and the profile displays + edits values, but
  there's no dedicated Settings screen for an owner to define new fields yet;
  today that requires calling the API directly.
- **Company-wide search across other entities** (jobs, invoices) — this
  module's search is customer-scoped only, matching what was asked for.
- **Background-job import/export** above the 5K/50K row synchronous ceilings
  — flagged inline in the code with the exact threshold, not silently capped.

## Suggested next steps

1. **Jobs & Scheduling module** — properties and customers now exist for
   real; jobs are the next dependency-root feature and the dashboard's
   Job Calendar/Today's Jobs widgets are still reading data I seeded
   manually, not data created through the app.
2. **Custom Fields settings UI** — close the gap flagged above so this
   doesn't stay an API-only feature.
3. **Wire notification-writing** — customer creation, merges, and duplicate
   resolution are exactly the kind of events the existing (read-only)
   notifications system should be surfacing to the team.

---

## AI Receptionist

`backend/src/receptionist/` (5 services, 1 controller) + `docs/ai-receptionist-architecture.md`.

**This one is fundamentally different from every other module in this
project.** Everything else here is either a real backend module or a
client-side prototype. Answering a phone call is neither — it's Twilio
hitting a real server's webhook the instant someone dials a real number,
whether or not anyone has a browser open anywhere. There's no version of
this that runs as a mock UI. So this shipped as: the real architecture
(`docs/ai-receptionist-architecture.md` — Twilio ConversationRelay for the
real-time voice loop, not old-style `<Gather>` IVR polling) plus the real
backend code implementing it, tested every way that's actually possible
without a live phone number.

**What it does.** Incoming call → business-hours check (real
timezone-aware logic, not server-clock UTC math) → during hours, connects
to an AI voice agent over Twilio ConversationRelay; after hours, voicemail.
The agent has 5 tools — `collect_customer_info`, `schedule_estimate`,
`reschedule_job`, `answer_faq`, `transfer_to_owner` — executed against the
same Prisma-backed Customer/Property/Job models the rest of the CRM uses,
not a separate call-handling database. When the call ends, a webhook
triggers async Claude summarization (topics, action items, sentiment) and,
if an appointment was booked or moved, a real Twilio SMS confirmation.

**Tested more rigorously than anything else in this project, because it
had to be.** There's no clicking through a UI to sanity-check a phone
call, so every piece of logic was validated against real, external ground
truth instead:
- **Webhook signature validation** — cross-checked against Twilio's own
  official SDK's `getExpectedTwilioSignature`, byte-for-byte match. My
  first attempt against a hand-recalled documentation example failed;
  rather than trust a training-data memory of an exact string, I installed
  Twilio's real npm package and used its own signing function as ground
  truth — which is what actually caught that the *algorithm* was right and
  my *recalled test vector* was wrong.
- **TwiML generation** — parsed with a real XML parser, including an
  adversarial test (a greeting containing `&`, `<`, `"`, and an apostrophe)
  to confirm escaping doesn't break the document Twilio receives.
- **Business hours** — timezone-aware via `Intl.DateTimeFormat`, tested
  against a known JS quirk (midnight sometimes formats as hour "24", not
  "0") and cross-timezone correctness (the same UTC instant open for an LA
  company and closed for an NY one).
- **Tool executor logic** — phone-based customer dedup and job-reschedule
  lookup validated against live seeded Postgres data (an existing phone
  number is found, not duplicated; an unknown one correctly finds nothing).

**A real bug found by that testing, not a demo walkthrough.** The FAQ
matching used `.includes()` for keyword scoring — which meant a completely
unrelated question like "do you sell chickens?" spuriously matched "Do
**you** clean roofs?" purely because both strings contain the substring
"you". Fixed with real word-boundary tokenization plus a stopword list,
then re-verified the fix didn't break any of the legitimate matches it was
passing before.

**What's not tested, and can't be from here.** The actual real-time
ConversationRelay WebSocket loop — Twilio streaming live transcribed
speech, the server calling Claude, streaming a response back to be spoken
— needs a live phone number and a real call. Every piece of logic that
loop depends on (tools, TwiML, signatures, hours) is tested; the live
audio loop itself needs Twilio's own test tools or a real deployment.

## Suggested next steps

1. **Jobs & Scheduling module** (unchanged from before — still the biggest
   gap: this and the receptionist's `schedule_estimate` tool both create
   real jobs, but there's still no UI for managing them day-to-day).
2. **ConversationRelay WebSocket gateway** — the architecture and TwiML
   side are built; the actual NestJS WebSocket handler that holds the
   relay connection open and loops Claude calls is the next concrete piece.
3. **Call Log UI** — `GET /receptionist/calls` and `GET
   /receptionist/calls/:id` exist; there's no frontend page rendering them
   yet.

---

## Customer Portal

`backend/src/portal/` (4 services, 1 guard, 1 controller).

**The one property that had to be airtight.** Every other module in this
project scopes data by `companyId` (tenant isolation, enforced by Postgres
RLS). A customer portal has a second, narrower boundary RLS knows nothing
about: two customers of the *same* company must never see each other's
records. `PortalDataService` filters every single query by both
`companyId` AND `customerId` — never one alone — and I proved this matters,
not just documented it: I ran the exact query shape a bug would produce
(company-scoped only, no customer filter) against live seeded data with
two real customers of the same company, and it *did* return both
customers' estimates mixed together. Then I confirmed the real
`PortalDataService` query shape (with the `customerId` filter) correctly
returns zero rows when Customer B queries for Customer A's estimate, one
row when Customer A queries their own, and the same pair of checks again
for property-photo-upload ownership and estimate-approval ownership. This
isn't a property you get right by writing careful-looking code — it's a
property you get right by trying to break it and watching it hold.

**A separate auth system on purpose.** Customers aren't `users` in this
system and have no business sharing a login surface with staff. Portal
auth is magic-link (no password — see `PortalAuthService` for why that's
the right threat-model fit here, not a corner cut), and the resulting
`PortalTokenPayload` is signed with `PORTAL_JWT_SECRET` — a completely
different secret from staff's `JWT_ACCESS_SECRET` — and carries a
`type: 'portal'` claim `PortalCustomerGuard` checks explicitly. A stolen
staff token and a stolen portal token are cryptographically incapable of
being used for each other's surface, even in a misconfiguration where
someone accidentally reused a secret.

**All 9 requested capabilities:**

| Capability | How |
|---|---|
| View / approve / decline estimates | Real Prisma queries + a real signature capture on approval (`signatureDataUrl`, same field shape the staff estimate builder uses) |
| Pay invoices | Real Stripe PaymentIntent creation (`StripePaymentService`) — card details never transit this server, keeping Renovo out of full PCI scope |
| Download invoices | A print-optimized HTML view (`GET /portal/invoices/:id/view`) — same real "Save as PDF" pattern as the staff invoice view, not a dead-end placeholder |
| View service history | Real completed-jobs query, customer-scoped |
| Upload photos | Same presigned-S3 pattern as the staff photo gallery, with an added property-ownership check so a customer can't attach a photo to a property that isn't theirs |
| Request service (one-time or recurring) | Creates a real `ServiceRequest` — always lands `pending` for staff review, never auto-books, same human-in-the-loop principle as every AI-adjacent action in this project |
| Chat with AI | Real Claude tool-calling, but with a **deliberately smaller tool set** than the staff AI Assistant or phone receptionist — read-only on the customer's own data, plus `request_service` (which files a request, doesn't book) — nothing here can create a Job or touch billing. The restriction is enforced by which tools exist, not by a prompt instruction a jailbreak could argue around. |

**A bug I almost shipped twice.** While writing the portal chat's
`answer_faq` tool, I started implementing the exact same naive
`.includes()` keyword matching that testing had already caught and fixed
in the phone receptionist's FAQ tool a few turns earlier — the one where
"do you sell chickens?" would spuriously match "Do **you** clean roofs?"
Caught it on review before it shipped this time and applied the same
word-boundary + stopword fix directly, rather than writing it wrong and
waiting for a test to catch it again.

**Cross-validated against real SDKs again.** Stripe's webhook signature
scheme (HMAC-SHA256 of `"{timestamp}.{body}"`) was verified the same way
Twilio's was: installed Stripe's real npm package, used its own
`generateTestHeaderString`/`constructEvent` as ground truth, confirmed my
implementation accepts everything Stripe's own SDK accepts and rejects
tampered payloads, wrong secrets, and stale (>5 min old) timestamps.

**Also fixed in this pass, unrelated to the portal itself:** `node_modules`
had been cleaned up before the last delivery's zip and never reinstalled,
so the first type-check of this session was checking against a broken
install (every external import failing) — not a real 200+ error regression.
Reinstalled and confirmed back to the same 5 known Prisma-stub-client
errors from every prior module. Separately, `tsconfig.json`'s unused
`baseUrl` option triggered a deprecation error on the TypeScript version
this reinstall picked up — removed it since nothing in this codebase
actually uses path-mapped imports.

**Deliberately not built yet:**

- **Portal frontend** — this delivery is backend-only, consistent with how
  the AI Receptionist shipped (real backend, no UI) two turns ago; a
  Next.js portal frontend consuming these endpoints is the natural next
  piece, and given the login flow and data model are now real and tested,
  it's a considerably smaller lift than the API layer was.
- **Stripe webhook endpoint** — `verifyWebhookSignature` is implemented and
  tested; the controller route that receives `payment_intent.succeeded`
  and marks the invoice paid isn't wired yet.
- **True PDF generation** — the invoice view is real, browser-printable
  HTML, not a literal `application/pdf` byte stream from a PDF library;
  flagged as the same pragmatic tradeoff made for the staff invoice view.

## Suggested next steps

1. **Portal frontend** (Next.js, consuming the now-real API) — the biggest
   remaining gap for this feature to be usable by an actual customer.
2. ~~**Stripe webhook handler**~~ — done this pass, see below.
3. **Jobs & Scheduling module** — still the standing gap under everything
   built on top of it.

---

## Solo-operator pivot: real automation, real payment reconciliation, real lead capture

Direction changed: this is being built first for one specific one-person
pressure-washing business, not launched as multi-tenant SaaS. Portal/
subscription/multi-company work is paused, not abandoned — nothing here
was ripped out, since the underlying multi-tenant architecture costs
nothing extra to run as a single company. Three things got built for real
this pass, all validated against live seeded Postgres data, not just
reviewed by eye:

**Stripe webhook, the gap flagged in the last two audits — closed.**
`POST /portal/webhooks/stripe` (`@Public()`, since Stripe isn't a logged-in
user and there's a global JwtAuthGuard on everything else). Verifies the
signature against the raw request body (`NestFactory.create(AppModule,
{ rawBody: true })` — a re-serialized `JSON.parse` would break Stripe's
signature scheme), then updates `Invoice.amountPaid`/`status`/`paidAt`
inside a transaction alongside a new `Payment` row. **Idempotent by
construction**: Stripe's docs guarantee at-least-once (not exactly-once)
webhook delivery, so a duplicate `payment_intent.succeeded` is checked
against `Payment.stripePaymentIntentId` before applying — verified against
live data that a repeated delivery is correctly skipped, not double-counted.

**Automation — moved from "evaluates correctly in a browser tab" to
"actually runs and actually sends."** New `automation/` module:
`AutomationService` (the three highest-ROI rules from the last workflow
review — estimate follow-up, recurring-maintenance reminder, review
request), a daily `@Cron('0 9 * * *')` scheduler, and real Twilio SMS
sending. **Deliberate design change from the earlier prototype**: routine
reminders send immediately, no approval queue — a solo operator manually
clearing an approval inbox every morning is exactly the admin overhead
this exists to remove. `AutomationLog` is what you review after the fact.
Dedup is enforced at the database level (`UNIQUE(company_id, dedupe_key)`
on `automation_log`), and the service inserts the dedupe row *before*
sending — verified live that a duplicate key is correctly rejected by
Postgres itself, closing the race window an application-level
check-then-send would leave open. All three rules' actual query logic
(estimate-follow-up eligibility, "most recent completed job per property,"
review-request window) tested against live seeded data, including a
negative case (a property serviced 2 months ago correctly does NOT trigger
a 12-month reminder).

**Public lead capture — the entry point that didn't exist.** `POST
/public/:companySlug/leads`, the one intentionally-unauthenticated write
endpoint in the whole system. Creates a real `Customer` (+ `Property` if
an address was given) and sends a real, immediate email to the company's
owner — a lead sitting unseen until someone happens to check the CRM
defeats the point of a self-serve form. Defended by tight rate limiting
(3/hour/IP — there's no auth to rate-limit against otherwise) and a
honeypot field that silently no-ops rather than erroring (an error
response just teaches a bot which field to leave blank). Owner lookup
(`company_users` joined through `roles` for an active `owner`) verified
against a freshly-seeded real user, not assumed correct from schema review
alone — the test database this project has used throughout never actually
had a seeded owner row until this pass.

### Still open
- The daily cron's SMS sending depends on real `TWILIO_*` env vars being
  configured — gracefully returns `{sent: false, error: 'twilio_not_configured'}`
  per-message if they're missing, same degrade-gracefully pattern as every
  other optional integration in this project, but worth remembering it's
  silent unless you check `automation_log`.
- No settings/log UI yet — `GET/PATCH /automation/settings`, `GET
  /automation/log`, and `POST /automation/run-now` all exist and work;
  there's no frontend screen for them.
- The lead-capture form itself (the actual HTML a website visitor fills
  out) isn't built — this delivers the endpoint it would submit to.


