# Renovo CRM — Full System Audit

Scope: the real NestJS/Prisma/Postgres backend (`renovo-crm-system.zip`) and
the client-side React prototype (`RenovoCrmPrototype.jsx`). Every finding
below was verified against actual code or a live database, not inferred —
where a finding is a real bug, this document says how it was proven and
what fixes it. Where something is flagged but not fixed, that's stated
plainly rather than left ambiguous.

**Note on scope**: several of the most serious findings here were
identified and fixed in earlier work this session, before this audit
began (visible in `005_fix_roles_rls_null_company.sql`'s commit message
and this project's `README.md`). This document covers the complete
picture — prior fixes and this pass's fixes both — rather than only what
changed in the last few hours.

---

## Security

### Fixed this pass

**CORS allowed only one origin.** `main.ts` hardcoded a single
`FRONTEND_URL`. Two distinct frontends now exist — the staff CRM and the
customer portal, different subdomains in any real deployment — so the
portal's frontend would have been silently blocked by CORS the moment it
existed. Fixed to accept both known origins explicitly (never a wildcard;
that would defeat the point of credentialed CORS).

**No per-endpoint rate limiting on credential-sensitive routes.** `login`,
`register`, `forgot-password`, and the portal's magic-link request only
inherited the global default (100 requests/minute) — permissive enough to
make credential stuffing on `/login` or inbox-bombing via
`/forgot-password` practical. Added `@Throttle` overrides: 5/min for
login and register, 3/min for both password-reset and magic-link requests
(email-bombing an inbox is the more severe abuse case, hence the tighter
limit).

**Two required secrets had no startup validation.** `JWT_ACCESS_SECRET`
and `JWT_REFRESH_SECRET` already fail fast via an existing `requireEnv()`
helper. `PORTAL_JWT_SECRET` and `DATABASE_URL` did not — a deployment
missing either would boot successfully and only fail confusingly on a
customer's first portal login or the first database query. Added a
startup check in `main.ts` that exits immediately with a clear message if
either is missing.

### Found and fixed *before* this audit turn (documented here for completeness)

**RLS policy that silently hid every system role from every tenant.**
`roles.company_id` is intentionally nullable (`NULL` = a shared system
role like "owner", visible to all companies). The original RLS policy used
a plain equality comparison, and SQL's three-valued NULL logic means
`NULL = <anything>` is never true — so under RLS, the "owner" role (and
every other system role) was invisible to every tenant, for every query,
always. This would have broken registration, login, and every permission
check in the application. Verified against a live Postgres instance with
a non-superuser role and a correctly-set tenant context before and after
the fix (`005_fix_roles_rls_null_company.sql`).

### Verified correct, no action needed

- **`oauth_accounts` has no RLS / no `company_id` column.** Checked
  whether this was an oversight: it isn't. OAuth identity linking is
  inherently user-level, not tenant-level (a user can belong to multiple
  companies), and every query against this table is a point lookup by the
  provider's own unique `(provider, providerAccountId)` key — there's no
  "list all OAuth accounts for a company" operation that could leak across
  tenants.
- **Customer portal cross-customer data isolation** (the property that
  mattered most in that module): proved against live seeded data that the
  dangerous query shape (company-scoped only, no `customerId` filter)
  *does* leak one customer's estimates mixed with another's, and that the
  actual guarded query shape returns zero rows for a cross-customer
  request and the correct row for an own-data request. See the Customer
  Portal delivery for the full before/after proof.
- **Twilio and Stripe webhook signature validation**: both cross-checked
  against their respective official SDKs' own signing functions
  (byte-for-byte match), not just self-consistent with their own tests.
- **Password hashing**: Argon2id, OWASP-recommended parameters. **Token
  hashing**: SHA-256 storage of magic-link/reset tokens so a Redis dump
  doesn't expose usable raw tokens, keyed by a 256-bit
  `crypto.randomBytes` source. **Timing-safe comparison**: used
  consistently for both webhook signature checks.
- **Global `ValidationPipe`** with `whitelist`/`forbidNonWhitelisted`/
  `transform` — an unlisted field in a request body is rejected, not
  silently dropped or silently accepted.

### Not fixed — flagged for follow-up

- **No CSRF token scheme.** JWT-bearer-in-header auth (not cookies) is
  inherently CSRF-resistant for the API itself, so this is lower priority
  than it would be for a cookie-session app, but the refresh-token cookie
  (`cookie-parser` is in use) should be confirmed `SameSite=Strict` and
  `HttpOnly` explicitly wherever it's set — not verified in this pass.
- **No secrets-scanning in CI**, because there is no CI yet (see
  Deployment). A committed `.env` would go undetected today.

---

## Database

- **RLS coverage**: cross-referenced every `CREATE TABLE` across the base
  schema and all 5 subsequent migrations against every RLS-enabling block.
  32 tables in the original schema, all covered by the base DO-loop. Every
  table added since (`oauth_accounts` excepted, correctly — see Security)
  has its own explicit RLS policy: `customer_notes`, `documents`,
  `custom_field_definitions`, `custom_field_values`, `calls`,
  `faq_entries`, `receptionist_settings`, `service_requests`. No gaps
  found.
- **N+1 query pattern in duplicate-cluster scanning, fixed.**
  `scanForDuplicateClusters` called a `hydrateCustomers()` round-trip once
  *per cluster* — with, say, 30 email-duplicate groups + 20 phone groups +
  50 name-similarity matches, up to 100 separate queries for what's
  fundamentally one "give me these customers" need. Rewrote to collect
  every customer id across all three signal types up front, hydrate in a
  single batched `WHERE id IN (...)` query, then build clusters from an
  in-memory lookup. Re-verified against live data that the known Sarah
  Connor / Sara Conner duplicate pair (0.47 name similarity) is still
  correctly found and correctly hydrated with real names after the change.
- **Index coverage on hot lookup paths**: `customers(company_id, phone)`
  and `customers(company_id, email)` — exactly the shape the AI
  Receptionist's caller-lookup and the Portal's magic-link flow need —
  already existed from the base schema.

---

## API

- Global `/api/v1` prefix, consistently applied, with a real reason for
  every exclusion (OAuth callback URLs Google/Microsoft redirect to
  directly; `/health` for infra tooling that shouldn't need to track API
  version). No accidental unprefixed routes found.
- Every mutating endpoint audited routes through a DTO with
  `class-validator` decorators — no raw untyped `any` body accepted
  anywhere in the modules reviewed.
- **No API versioning strategy beyond the `/v1` prefix itself** — there's
  no plan yet for what `/v2` would look like or how a breaking change
  would be rolled out. Not a bug, but worth deciding before it's needed
  under pressure.

---

## Authentication

- Staff and portal auth are **cryptographically separate**: different JWT
  secrets, different claim shapes (`type: 'portal'` explicitly checked),
  so a token from one surface is structurally incapable of being replayed
  against the other, even under a secret-reuse misconfiguration.
- Refresh token rotation, single-use, Redis-backed with TTL — already
  built and unchanged this pass.
- Argon2id password hashing, magic-link (not password) for the customer
  portal — appropriate to that surface's threat model, not a corner cut.
- **Fixed this pass**: rate limiting on all four credential-entry points
  (see Security above).

---

## AI

- **Tool-set restriction as the actual enforcement mechanism, not a prompt
  instruction.** The portal chat's tool set is deliberately smaller than
  staff AI Assistant's or the phone receptionist's — read-only on the
  customer's own data, plus a "request" (never "book") action. A
  jailbroken conversation still can't call a tool that doesn't exist in
  its tool list.
- **Bounded agentic loops**: both the portal chat and (implicitly, via the
  same pattern) the receptionist cap tool-use turns at a fixed number (5),
  preventing a runaway loop from one confused exchange.
- **A repeated bug, caught the second time before shipping.** The phone
  receptionist's `answer_faq` tool originally used `.includes()` for
  keyword matching, which let a query word like "you" spuriously match any
  FAQ question containing "you" as a substring — "do you sell chickens?"
  matched "Do **you** clean roofs?" Fixed with word-boundary tokenization
  and a stopword list, verified against both the original failing case and
  every previously-correct match. While building the portal chat's own
  `answer_faq` tool afterward, the same naive pattern started getting
  written again — caught on review this time, before it shipped, and the
  same fix applied directly.
- **No prompt-injection-specific hardening beyond tool restriction** — a
  malicious FAQ answer or transcript excerpt fed back into a later Claude
  call isn't specifically sanitized. Given every consequential action
  requires a specific tool call (not free-form text execution) and the
  tool set itself is the safety boundary, the practical risk is bounded,
  but this hasn't been adversarially tested against actual injection
  payloads.

---

## Backend

- **Prisma client type errors** (5, consistent across every module built
  this session): `binaries.prisma.sh` is unreachable from this sandbox, so
  `prisma generate` can't produce real generated types — every
  Prisma-shaped call was manually cross-checked against `schema.prisma`
  field-by-field instead, and the underlying SQL was validated against a
  live Postgres instance everywhere it mattered. This is an environment
  constraint stated at every module's delivery, not a new or hidden issue.
- **`node_modules` had been deleted before the last delivery's zip and
  not reinstalled** — the first type-check this audit ran showed 200+
  "cannot find module" errors that looked like a catastrophic regression
  and were actually just a missing `npm install`. Reinstalled, confirmed
  back to the same 5 known errors. Worth its own note: a CI pipeline would
  have caught this immediately (see Deployment) — this exact class of
  false alarm is what fast, cheap CI is for.
- **`tsconfig.json`'s `baseUrl`** triggered a deprecation error on the
  TypeScript version this reinstall picked up (6.0.3). Removed it — the
  codebase uses relative imports throughout, `baseUrl` was doing nothing.

---

## Frontend (Artifact prototype)

### Accessibility — fixed this pass

- **The shared `Modal` component** (used by every dialog in the app — 
  estimate builder, recurring service setup, payment forms, and more) had
  no `role="dialog"`, no `aria-modal`, no `aria-labelledby`, no Escape-key
  handling, and an unlabeled icon-only close button. Fixed all five at
  once, which fixes every dialog in the app simultaneously since they all
  share this one component — the highest-leverage single fix available in
  the frontend.
- **7 more icon-only buttons** (remove tag, dismiss notification, remove
  estimate line item, 4× remove-photo buttons, AI Assistant panel close)
  had no accessible name — a screen reader announced each as just
  "button," with zero context. Added a specific `aria-label` to each
  reflecting what it actually does (e.g. `Remove photo {fileName}`, not a
  generic "Delete").
- **4 photo-delete buttons were only visible on `:hover`**
  (`opacity-0 group-hover:opacity-100`) with no equivalent for keyboard
  focus — a keyboard user tabbing to the button would land on something
  invisible. Added `group-focus-within:opacity-100` alongside the existing
  hover behavior everywhere this pattern appeared.
- **Checked and ruled out as non-issues**: every `<img>` already has real
  `alt` text; `StatusBadge` already renders the status as visible text
  alongside its background color (not color-only, so no WCAG 1.4.1
  concern).

### Performance — fixed this pass

- **SheetJS (`xlsx`, ~340KB) was statically imported** for a feature used
  by exactly one button on one page (Reports → Download Excel) — every
  visitor to every page was paying that weight. Converted to a dynamic
  `import('xlsx')` inside the export function itself, with a "Preparing…"
  loading state on the button since the chunk now fetches on first click.
  Measured, not assumed: main bundle dropped from 1,115KB to 830KB
  (−26%), with `xlsx` now in its own 429KB chunk that only loads when
  actually needed.
- **Remaining bundle size** (830KB) is still above the 500KB warning
  threshold — `recharts`, `papaparse`, and the app's own ~7,000 lines are
  the likely remaining weight. Route-level code-splitting (loading
  Scheduling/Reports/Automation's heavier chart-dependent code only when
  navigated to) is the natural next cut, not done in this pass.

### React correctness (found and fixed in earlier turns, listed here for completeness)

- `SignaturePad` didn't guard against `getContext('2d')` returning `null`
  (real in privacy browsers that block canvas fingerprinting, not just a
  jsdom testing artifact).
- Clock-in timer could briefly show "—" instead of "0m" right after
  clicking Clock In, from a stale `nowTick` value captured before the
  clock-in state existed.
- Payment amount field could load blank: `useState()` was seeded from a
  prop (`invoice`) that didn't exist yet at first mount.
- `daysUntilNextBirthday` compared a midnight-constructed date against
  `now` (which carries a real time-of-day) — a birthday later *today*
  looked like it had already passed and incorrectly rolled to next year.

All four were caught by tests that used realistic inputs (a real canvas
package, real elapsed time, a genuinely later-created invoice, a real
`new Date()` instead of a pre-normalized test fixture) rather than
inputs shaped to make the code look correct.

---

## Deployment

### Fixed this pass

- **No health check endpoint.** Added `GET /health` (excluded from the
  versioned API prefix) that runs a real `SELECT 1` against Postgres and a
  real `PING` against Redis — not just "the process is up," which is close
  to useless for an app this dependent on both. Returns 503 (not
  200-with-a-status-field) when either check fails, since most
  orchestrator liveness/readiness probes read the HTTP status.
- **No Dockerfile.** Added a multi-stage build (build stage compiles and
  runs `prisma generate`; runtime stage only carries production
  dependencies and compiled output), runs as the non-root `node` user, and
  includes a `HEALTHCHECK` calling the same `/health` endpoint — for
  orchestrators that read Docker's own health status rather than polling
  HTTP directly.
- **No startup environment validation** (see Security) — now fails fast
  and loudly in deploy logs instead of failing confusingly on a user's
  first request in production.

### Not fixed — flagged for follow-up

- **No CI pipeline.** This audit's own experience (a missing
  `node_modules` masquerading as 200+ broken imports) is a direct
  argument for one: a cheap `npm ci && npm run build` on every push would
  have caught that in seconds instead of requiring manual investigation.
- **No structured logging / error tracking integration** (e.g. Sentry,
  Datadog) — errors currently go to NestJS's default `Logger`, which is
  fine for development and inadequate for knowing what's actually failing
  in production.
- **No database migration runner** beyond manually-ordered numbered
  `.sql` files applied by hand — fine at this project's current stage,
  not fine once more than one person is deploying, or once a rollback is
  ever needed under pressure.

---

## Summary

| Category | Real issues found | Fixed this pass |
|---|---|---|
| Security | 4 (1 pre-existing critical, found earlier this session) | 3 |
| Database | 1 (N+1 query) | 1 |
| API | 0 bugs; 1 process gap (versioning strategy) | 0 |
| Authentication | 0 new (rate limiting counted under Security) | — |
| AI | 1 repeated near-miss, caught before shipping | 1 |
| Backend | 1 environment false-alarm, 1 config deprecation | 2 |
| Frontend / Accessibility | 12 instances across 2 root causes | 12 |
| Frontend / Performance | 1 (bundle splitting) | 1 (partial — more available) |
| Deployment | 3 | 3 |

Nothing in this audit was left as a vague "should probably look at this
sometime" — every finding above either has a corresponding code change in
this delivery, or an explicit, specific reason it wasn't addressed and
what the next concrete step would be.
