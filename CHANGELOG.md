# Changelog

All notable changes to this project. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/) — grouped by what actually
shipped, not by date, since this project moved through design and
implementation together rather than on a release schedule.

## [0.1.0-rc.1] — Release Candidate 1

### Major features completed
- **Authentication** — registration, login, password reset, email
  verification, Google/Microsoft OAuth (optional, degrades gracefully
  without credentials configured), company invites, session management.
  The one fully complete, tested, frontend-connected feature alongside
  Customer Management.
- **Customer Management** — full CRUD, duplicate detection and merge,
  notes, custom fields, CSV import/export, photo/document uploads via
  presigned S3 URLs.
- **Estimates** — multi-line-item quotes with real per-service pricing,
  server-computed subtotal/discount/tax/total (never trusted from the
  client), service-specific detail fields (strongly validated per service
  type: roof soft wash, driveway cleaning, house wash), draft/send/accept/
  decline lifecycle, and conversion to an unscheduled job. Includes a
  full cost/profitability model (labor, chemical, equipment, fuel, misc
  costs; server-computed profit and margin) restricted to a dedicated
  `estimates.profitability` permission — never exposed to the customer
  portal.
- **Automation engine** — real, cron-driven (not client-side/browser-tab
  dependent) rules for estimate follow-ups, recurring-maintenance
  reminders, and review requests. Sends real SMS (Twilio) and email
  (Postmark) when configured; logs and gracefully no-ops when not.
- **AI Receptionist** — Twilio-integrated phone answering backend:
  customer lookup/creation, estimate scheduling, job rescheduling, FAQ
  answering, call summarization. See `docs/ai-receptionist-architecture.md`.
- **Customer Portal (backend)** — magic-link auth, estimate approval/
  decline with signature capture, invoice viewing and Stripe payment,
  service history, photo uploads, AI chat scoped to the customer's own
  data. No frontend yet — backend only.
- **Dashboard (backend)** — summary metrics, calendar, map data, weather,
  notifications, AI suggestions. No frontend yet — backend only.
- **Lead capture** — public, unauthenticated endpoint with honeypot and
  rate limiting, creates a real customer record and notifies the owner.

### Database
- 10 migrations, `000` through `010` (`007` reserved for seed data, not a
  schema migration).
- Row-Level Security enforced on every tenant-scoped table, with a
  Prisma Client Extension (`TenantContextService` +
  `TenantContextInterceptor`) making tenant scoping automatic on every
  query rather than a per-service-file discipline — the fix for a real
  audit finding that every tenant-scoped query was silently returning
  zero rows under a non-superuser connection.
- Real seed data (`backend/prisma/seed.sql`) — a working demo login, not
  placeholder rows.
- Estimate line items, service-specific JSONB details, and the full
  cost/profitability schema (migrations `008`–`010`) — discovered during
  `008` that the original base schema already had a more complete
  `estimate_line_items` design than what had been implemented in Prisma;
  extended that existing design rather than duplicating it.

### Architecture improvements
- Structured JSON logging (pino) with explicit redaction of
  Authorization headers, cookies, and password fields — replacing the
  bare default NestJS logger.
- A global exception filter distinguishing intentional application
  errors (safe to show the client) from genuinely unexpected ones
  (generic message to the client, full detail logged server-side) —
  later corrected to preserve rich, intentionally-informative response
  bodies (like the health check's `{status, checks}` breakdown) instead
  of collapsing everything to a generic message.
- A real `/health` endpoint checking actual database and Redis
  connectivity, not just process liveness.
- Startup integration-status reporting — every optional external service
  (Twilio/Postmark/Stripe/AWS) logs its configuration state at boot,
  closing a "silent failure" gap where a misconfigured integration would
  only be discovered when a customer didn't receive a message.
- Multi-stage Dockerfile with OpenSSL installed in both build and
  runtime stages — a real bug found only once this actually built in a
  real (non-sandboxed) Docker environment for the first time.
- A real automated test suite (Jest) — the project's first — covering
  the estimate pricing and profitability calculation logic.

### Deployment milestones
- Automated daily database backups, tested end-to-end (a genuine
  dump/restore cycle, including verifying Row-Level Security policies
  survive the restore intact), syncing off-device via Dropbox.
- **First successful production deployment to Railway**, reached after
  diagnosing and fixing a real sequence of distinct issues: a UTF-16
  file-encoding artifact, a missing dependency-injection wiring for the
  tenant-context interceptor, an OAuth strategy that was hard-required
  at boot instead of optional, a missing OpenSSL package in the Docker
  image, a Redis environment-variable naming mismatch, and a second,
  separate Redis password gap.
- Full project rename from "Aquila CRM" to "Renovo CRM" across every
  file type, including functional identifiers (JWT issuer strings,
  session cookie names) that had to be kept in sync across both the
  code that sets them and the code that reads them.

### Known gaps, stated plainly
- No frontend yet for Estimates, the Dashboard, Automation
  configuration, or the Customer Portal — all real, tested backend with
  nothing to click yet.
- No Scheduling or Invoices modules — Estimates can convert to an
  unscheduled Job, but nothing yet assigns it a date.
- No Reports module, backend or frontend.
- Stripe failed-payment handling (`payment_intent.payment_failed`) not
  yet implemented — only the success path is handled.
- Audit Trail system — designed and approved, intentionally not started.

See `docs/PROJECT_STATUS.md` for the complete, current feature-by-feature
breakdown.
