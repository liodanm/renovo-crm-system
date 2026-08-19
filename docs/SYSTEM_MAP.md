# SYSTEM_MAP.md

Full technical inventory as of commit `f274921` (2026-08-18). Not a
status/classification document — see `PROJECT_STATUS.md` for that.

---

## Frontend (`frontend/app/`)

**Auth (unauthenticated staff flows):** `(auth)/login`, `/register`,
`/forgot-password`, `/reset-password`, `/select-company`,
`/verify-email`, `/auth/callback` (OAuth).

**Staff app (authenticated):** `customers` (+ `[id]`, `/duplicates`),
`estimates` (+ `[id]`, `/new`), `invoices` (+ `[id]`), `jobs` (+ `[id]`),
`payments` (+ `/receipt`), `reports`, `scheduling`, `service-catalog`
(+ `[id]`, `/new`).

**Settings:** card-grid landing (`settings/page.tsx`) + dynamic
`[section]` route + explicit section pages: `appearance`, `automation`,
`branding`, `business-defaults`, `company`, `data-management`, `email`,
`estimates`, `google-reviews`, `import-export`, `integrations`,
`lead-sources`, `payments`, `profile`, `sms`, `storage`.

**Customer Portal (separate auth):** `portal/[companySlug]/login`,
`/[companySlug]/verify`, `portal/dashboard`, `portal/estimates` (+
`[id]`), `portal/invoices/[id]`, `portal/page.tsx`.

**Shared components (`frontend/components/`):**
`action-center/` (StatusBadge, StatusTimeline, ConfirmDialog),
`auth/permission-gate.tsx`, `documents/DocumentEmailSection.tsx`,
`settings/SettingsSectionShell.tsx`, `payments/PaymentsSection.tsx`, plus
feature-specific components: `LineItemModal`, `EstimateForm`, `ActionBar`,
`CompletionFlow`, `PhotoSection`, `SignaturePad`, `ChemicalSection`,
`EquipmentSection`, `AppointmentDetailPanel`, `customer-table`,
`import-csv-modal`, `PayInvoiceModal`.

---

## Backend (`backend/src/`) — 24 modules

| Module | Type | Purpose |
|---|---|---|
| `auth` | Full module | JWT auth, OAuth, company invites, guards (`PermissionsGuard`/`RolesGuard`) |
| `customers` | Full module | Customer CRUD, dedup/merge, CSV import/export, properties sub-resource |
| `leads` | Thin module | One public capture endpoint, no separate entity |
| `estimates` | Full module | Creation, line items, totals, expiration, convert-to-job |
| `jobs` | Full module | Creation, status, completion flow, chemicals/equipment |
| `scheduling` | Full module, raw-SQL-only | Appointments, assignment, auto-assign, cancellation — no Prisma model |
| `invoices` | Full module | Creation from job, PDF, email, void |
| `payments` | Full module | Manual recording, Stripe integration entry points |
| `portal` | Full module | Magic-link auth, portal data access, Stripe webhook handler, portal chat |
| `documents` | Full module | PDF generation, company-context (branding), email-log |
| `mail` | Full module | Outbound email processor (Postmark), BullMQ-style |
| `sms` | Thin module | Outbound SMS (Twilio), parallel to `mail` |
| `automation` | Full module | Cron-driven rule engine, all automated messaging |
| `service-catalog` | Full module | Per-service pricing/validation backing Estimates |
| `settings` | Full module | Company/branding/business/payments/email/SMS/storage/automation settings |
| `reports` | Full module | Dedicated services/DTOs |
| `dashboard` | Full module | Summary metrics, calendar range |
| `search` | Thin module | Cross-entity search dropdown |
| `ai` | Thin module | Dashboard AI suggestions, Redis-cached |
| `weather` | Thin module | Open-Meteo forecast, Redis-cached |
| `geocoding` | Thin module | Nominatim address→coordinates, Redis-cached |
| `receptionist` | Full module, no frontend | Twilio call handling, TwiML, FAQ, call summaries |
| `admin-data` | Thin module | Owner-only, company-scoped permanent deletion |
| `public` (`quote-widget/`) | Full module, no confirmed frontend | Public quote capture with source attribution |
| `common` | Shared infra | Prisma wrapper, tenant context, exception filter, storage, integration status, Redis, automation-event util, document-totals util, slugify |
| `health` | Thin module | DB + Redis liveness/readiness |

---

## Database

**Prisma-modeled (35 models):** Company, User, Role, Permission,
RolePermission, CompanyUser, OauthAccount, Crew, Customer, Property,
Estimate, EstimateLineItem, Job, JobLineItem, ServiceCatalogItem,
JobStatusHistory, JobChemicalUsage, JobEquipmentUsage, JobAuditLog,
Invoice, Payment, InvoiceLineItem, Notification, Photo, CustomerNote,
Document, CustomFieldDefinition, CustomFieldValue, Call, FaqEntry,
ReceptionistSettings, ServiceRequest, AutomationSettings, AutomationLog,
ReviewRequest, Review.

**Real tables NOT in Prisma schema (raw-SQL-only access):**
`appointments`, `appointment_status_history`.

**Migrations:** 40 files, `backend/prisma/migrations/` (authoritative) +
`init-scripts/` (Docker Compose bootstrap mirror, CI-sync-checked).
Applied via `scripts/run-migrations.sh` (psql loop, `schema_migrations`
tracking table), intended as a Railway pre-deploy command — wiring not
independently verifiable from the repo (Railway dashboard config isn't
committed).

**RLS:** Present on every tenant-scoped table, `company_id`-keyed,
enforced only through `withTenantContext`.

---

## Integrations

| Integration | Purpose | Key required | Degrades gracefully |
|---|---|---|---|
| Stripe | Customer-facing invoice payment (portal) | Yes | Yes — logs/no-ops if unconfigured |
| Postmark | Outbound email | Yes | Yes |
| Twilio | SMS + AI Receptionist voice/call handling | Yes | Yes |
| AWS S3 | Presigned upload URLs (photos, docs, logo) | Yes | Yes |
| Google/Microsoft OAuth | Staff login | Yes | Yes — optional, password auth always available |
| Open-Meteo | Weather | No | N/A — no key needed |
| OpenStreetMap Nominatim | Geocoding | No | N/A — no key needed |
| Google Reviews (Place ID) | Review display | Per-business Place ID + server-level API key | Partial — distinct error states for each missing piece |
| Anthropic API | Dashboard AI suggestions, portal chat | Yes | UNKNOWN — not confirmed whether this degrades gracefully if unconfigured; recommend checking `ai-suggestions.service.ts` / `portal-chat.service.ts` directly before assuming it follows the same pattern as the others |

---

## Webhooks

- `POST /portal/webhooks/stripe` — `@Public()`, signature-verified,
  handles `payment_intent.succeeded` and `payment_intent.payment_failed`.
  This is the only inbound webhook found in the codebase.

## Cron / Background processes

- Automation engine (`automation/`) — cron-driven, rule types:
  `estimate_followup`, `recurring_reminder`, `review_request`,
  `estimate_viewed`, `estimate_approved`, `estimate_declined`,
  `invoice_viewed`, `invoice_paid`, `payment_reminder`,
  `estimate_expiration_reminder`, `job_thank_you`, `estimate_expired`,
  `payment_failed`.
- Mail processor (`mail/mail.processor.ts`) — BullMQ-style, not
  strictly cron but a background queue worker.

## AI features

- Dashboard AI suggestions (`ai/ai-suggestions.service.ts`) — Redis-cached.
- Customer Portal AI chat (`portal/services/portal-chat.service.ts`) —
  scoped to the authenticated customer's own data.
- AI Receptionist (`receptionist/`) — real backend, no settings UI, no
  confirmed live-call testing.

## Public (unauthenticated) endpoints

- `POST /public/:companySlug/leads` — lead capture, rate-limited + honeypot.
- `public/quote-widget/*` — quote request capture.
- `POST /portal/:companySlug/auth/request-link` — magic-link request,
  rate-limited.
- `POST /portal/auth/verify` — magic-link verification.
- `POST /portal/webhooks/stripe` — Stripe webhook.
- `GET /health` — liveness/readiness.

## Customer-facing features

Customer Portal (Estimates view/approve/decline, Invoice view/pay/
download), all outbound email/SMS the customer receives, the public
lead-capture form, the quote widget backend.

## Admin features

Owner-only company-scoped permanent data deletion (`admin-data/`). No
platform/cross-tenant admin exists.

## Settings features

See PROJECT_STATUS.md Settings table — 15+ real sections, one gap
(Team & Access has no UI despite backend support existing).

---

## Deployment configuration

- **Docker:** multi-stage `Dockerfile` per service (`backend/Dockerfile`,
  implied frontend equivalent), `docker-compose.yml` for local dev
  (mounts `init-scripts/` into Postgres init).
- **CI:** `.github/workflows/ci.yml` — PR gate only, three jobs
  (repo-integrity, backend, frontend). Does not deploy.
- **Deploy:** Railway, watching `main` directly, independent of CI.
  Pre-deploy migration step (`scripts/run-migrations.sh`) exists in-repo;
  actual Railway dashboard wiring not verifiable from source.
- **DNS:** Cloudflare (per project convention, not verifiable from repo).
- **Env config:** `backend/.env.example`, `frontend/.env.local.example`
  — see `docs/ENVIRONMENT_VARIABLES.md` for the documented list (not
  re-verified line-by-line in this audit; flag for a targeted pass if
  environment drift is suspected).
