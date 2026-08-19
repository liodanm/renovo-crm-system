# PROJECT_STATUS.md

Authoritative feature classification, established by direct source
inspection at commit `f274921` (2026-08-18). Every row below is
evidence-backed — see the "Evidence" column. Nothing is classified
COMPLETE merely because files exist.

**Classification key:**
`COMPLETE` · `NEEDS HARDENING` · `PARTIAL` · `UNTESTED` (implemented,
not verified — not the same as broken) · `PLANNED` · `NOT IMPLEMENTED` ·
`DEPRECATED` · `UNKNOWN`

---

## Core CRM

| Feature | Classification | Evidence |
|---|---|---|
| Customers | COMPLETE | Full CRUD, duplicate detection/merge, CSV import/export, S3 photo/doc uploads. `customers.service.ts` + `customer-table.tsx` + `import-csv-modal.tsx`, all wired end-to-end. |
| Leads | COMPLETE (as narrowly scoped) | One public endpoint (`POST /public/:companySlug/leads`) → `CustomersService.findOrCreateByEmail` with `lead_status='lead'`. No dedicated Lead entity by design (ADR-011). Rate-limited (3/hr/IP) + honeypot field. |
| Properties | COMPLETE (as narrowly scoped) | Sub-endpoints under `/customers/:id/properties` only, no dedicated page — intentional, avoids a duplicate system per existing design note. |
| Contacts | NOT A SEPARATE FEATURE | No `Contact` model exists; contact info lives directly on `Customer`. Not a gap — never designed as separate. |
| Search (global) | COMPLETE | `search/search.service.ts` — cross-entity (Customers/Estimates/Invoices/Jobs) ILIKE search, companyId-scoped, reuses the matching condition from `CustomersService.list()`. |
| Dashboard | COMPLETE (backend + frontend) | `dashboard/` module + `frontend/app` dashboard page; AI suggestions cached in Redis via `ai-suggestions.service.ts`. |

## Estimates

| Feature | Classification | Evidence |
|---|---|---|
| Creation | COMPLETE | `estimates.service.ts`, server-computed defaults for `validUntil`/`taxRatePercent`. |
| Line items | COMPLETE | `EstimateLineItem` model, service-specific validated JSONB detail fields, redesigned UX (compact cards + `LineItemModal`). |
| Pricing / totals | COMPLETE | Routed exclusively through `computeDocumentTotals` (ADR-008), re-verified — no inline total math found elsewhere. |
| Discounts | COMPLETE | `discount_source` (`package`/`manual`) tracked and snapshotted through to invoices (migration `034`). |
| Taxes | COMPLETE | Server-computed, part of `computeDocumentTotals`. |
| Expiration | COMPLETE | Migration `027` + automation rule types (`estimate_expiration_reminder`, `estimate_expired`) wired into `automation.service.ts`. |
| Sending | COMPLETE | Delivered via authenticated Customer Portal deep link (magic link); PDF attachment deliberately removed from this email. |
| Viewing (tracked) | COMPLETE | `viewedAt`/status transition on portal view, fixed bug (status wasn't transitioning) confirmed resolved in current source. |
| Acceptance | COMPLETE | Portal (signature capture) or staff manual accept; auto-creates Job (ADR-001, verified in `acceptManually`). |
| Decline | COMPLETE | Portal decline path in `portal-data.service.ts::declineEstimate`, ownership-checked. |
| Signature capture | COMPLETE | Part of portal approve flow; `SignaturePad.tsx` also used in Job completion. |
| Conversion to job | COMPLETE, WITH AN OPEN DECISION | Auto-conversion on acceptance works (ADR-001). A **separate manual `POST /estimates/:id/convert-to-job` endpoint is also still live** — ADR-007, unresolved. Not broken; a genuine open product decision (see ROADMAP.md). |
| Cost/profitability model | COMPLETE | Labor/chemical/equipment/fuel/misc costs, server-computed profit/margin, gated behind a dedicated permission, never exposed to portal. |

## Customer Portal

| Feature | Classification | Evidence |
|---|---|---|
| Authentication | NEEDS HARDENING | Magic-link auth works (`portal-auth.service.ts`), but the surrounding auth-routing has a confirmed recent history of bugs: staff `AuthProvider`/global `JwtAuthGuard` intercepting portal routes, a magic-link DTO that shipped without validation decorators (400 on all verification), missing `@Public()` on portal-customer routes. All confirmed fixed in current source, but this is a real, recent, repeated bug pattern in exactly this area — classify as working-but-needs-continued-scrutiny, not as hardened. |
| Estimate viewing | COMPLETE | `frontend/app/portal/estimates/[id]/page.tsx` + `portal-data.service.ts::getEstimates`/`getOwnedEstimate`. |
| Estimate approval | COMPLETE | With signature capture, ownership-checked (`companyId` + `customerId`). |
| Estimate decline | COMPLETE | Same ownership-check pattern. |
| Signature | COMPLETE | Shared with Job completion flow. |
| Invoice viewing | COMPLETE | `frontend/app/portal/invoices/[id]/page.tsx`, viewed-at tracking (migration `022`). |
| Invoice payment | COMPLETE, UNTESTED END-TO-END IN PRODUCTION | Stripe payment intent flow exists (`stripe-payment.service.ts`) and webhook handling exists (both succeeded + failed) with signature verification — implementation is real and internally consistent, but no test coverage and no confirmation of a real production transaction was found in the repo. Classify implementation as COMPLETE, live-verification as UNTESTED. |
| Invoice download | COMPLETE | PDF generation reused from the staff-side PDF system (`pdf.service.ts`), same system, not duplicated. |
| Job information | NOT IMPLEMENTED (in portal) | No portal route or `portal-data.service.ts` method surfaces Job data directly to a customer — portal covers Estimates and Invoices, not Jobs. |
| Security (ownership checks) | COMPLETE | Verified directly — every portal-data query is explicitly double-scoped by `companyId` and `customerId`, not relying on RLS alone. |

## Scheduling

| Feature | Classification | Evidence |
|---|---|---|
| Appointments | COMPLETE, RAW-SQL-ONLY | Real table, fully functional, but **no Prisma model** — confirmed by direct schema search. All access via `$queryRaw`/`$executeRaw` in `scheduling.service.ts` (29 raw calls). Functionally complete; architecturally an outlier vs. every other module. |
| Calendar (day/week/month) | UNKNOWN | `dashboard/` has a `calendar-range.dto.ts` and a read path; could not confirm from source alone whether day/week/month views are all implemented in the frontend calendar UI vs. just the backend range query existing. Recommend direct UI verification before assuming full coverage. |
| Assignment | COMPLETE | Technician assignment via `assignedUserId`/`company_users`, conflict-checked (`assertNoTechnicianConflict`). |
| Auto-assignment | COMPLETE | Verified directly: first scheduling of a job with no `assignedUserId` and no existing appointment auto-assigns to the scheduling user; reschedules of an already-assigned appointment preserve the existing assignment. |
| Rescheduling | COMPLETE | Same service handles reschedule with conflict-checking against the effective assignee. |
| Weather | COMPLETE | `weather/weather.service.ts` — Open-Meteo, Redis-cached with real TTL, no API key required. |
| Maps | UNKNOWN | No dedicated maps/mapping frontend component was located in this pass; geocoding exists (below) but whether it feeds an actual map UI vs. just distance/routing math was not confirmed. |
| Geocoding | COMPLETE | `geocoding/geocoding.service.ts` — OpenStreetMap Nominatim, no key, Redis-cached with no expiry (coordinates don't change). |
| Cancellation | COMPLETE | Migration `030` — `cancellation_reason` column + `appointment_status_history` table, same pattern as job/payment/estimate history. |

## Jobs

| Feature | Classification | Evidence |
|---|---|---|
| Creation | COMPLETE | From accepted estimate (`createFromEstimate`) or manual convert endpoint. |
| Status | COMPLETE | `JobStatusHistory` model, `StatusTimeline` shared component. |
| Photos | COMPLETE | `PhotoSection.tsx`, S3-backed via `StorageService`. |
| GPS | UNKNOWN | No dedicated GPS/location-capture field or service was confirmed for Jobs specifically in this pass (distinct from Geocoding, which is address→coordinates for scheduling/weather, not a job check-in GPS stamp). Flag for direct verification if GPS check-in is an expected feature. |
| Labor | COMPLETE | Cost/profitability model on Estimates carries through; job-level labor rate resolution documented in `estimate-profit.util.ts` (also unit-tested — one of the 5 real test files in the repo). |
| Chemicals | COMPLETE | `JobChemicalUsage` model, `ChemicalSection.tsx`. |
| Equipment | COMPLETE | `JobEquipmentUsage` model, `EquipmentSection.tsx`. |
| Completion | COMPLETE | `CompletionFlow.tsx` — photos, signature, chemicals/equipment in one flow. |
| Signature | COMPLETE | Shared `SignaturePad.tsx`. |
| Priority | COMPLETE | 4-level (`normal/follow_up/high/emergency`), migration `031`, replacing an unused 3-level constraint. |

## Invoices

| Feature | Classification | Evidence |
|---|---|---|
| Creation | COMPLETE | `generateFromJob` — real line items, current tax rate, due-date defaults from a completed job, not manual re-entry. |
| PDF | COMPLETE | Server-side generation, `pdf.service.ts` + `company-context.service.ts` for live branding/logo. |
| Branding | COMPLETE | Read live at render time, never snapshotted (ADR-004), now includes uploaded logo + per-tenant brand colors. |
| Payment status | COMPLETE | Derived via `invoice-status.util.ts` — one of the 5 real unit-tested files in the repo. |
| Void | NEEDS HARDENING | Functionally works but uses browser native `confirm()` instead of the shared `ConfirmDialog` component — confirmed directly in `frontend/app/invoices/[id]/page.tsx`. Cosmetic/consistency gap, not a functional bug. |
| Customer portal | COMPLETE | View/pay/download, viewed-tracking — see Customer Portal section above. |
| Email | COMPLETE | Via `mail.processor.ts`, logged in `email_log`, surfaced through `DocumentEmailSection.tsx` + "Email History." |
| Payment (recording) | COMPLETE | See Payments section. |

## Payments

| Feature | Classification | Evidence |
|---|---|---|
| Stripe (success) | COMPLETE | `payment_intent.succeeded` handled in `portal.controller.ts::handleStripeWebhook`, signature-verified. |
| Stripe (failure) | COMPLETE | `payment_intent.payment_failed` handled in the same webhook, logs via `logAutomationEvent` with `rule_type='payment_failed'` (migration `029`). Confirmed by direct source read, not inferred from a migration comment alone. |
| Cash / Check | COMPLETE | Manual payment recording, pre-existing. |
| Zelle | COMPLETE | Added as a recordable manual payment method (recent work; confirmed present). |
| Payment status | COMPLETE | Same `invoice-status.util.ts`, unit-tested. |
| Failed payments (staff visibility) | COMPLETE | Logged via automation engine, same visibility path as `invoice_paid`. |
| Voids | NEEDS HARDENING | Same `confirm()`-instead-of-`ConfirmDialog` gap as Invoice Void, confirmed in `PaymentsSection.tsx`. |
| Refunds | UNKNOWN | No dedicated refund model/flow was located distinct from a payment void. If refunds (as opposed to voiding a manually-recorded payment) are an expected feature, it does not appear to exist — recommend explicit confirmation before assuming either way. |
| Webhooks | COMPLETE | Signature-verified (`stripe.verifyWebhookSignature`), both event types handled, fast 200 returned regardless of match per Stripe's retry semantics. |
| Tip amount | COMPLETE | Migration `035`, additive, separate from `amount`. |
| Processing fee + card type | COMPLETE | Migration `037`, additive, separate from `amount`. |
| Standalone payments (no invoice) | COMPLETE | Migration `036` — `invoice_id` nullable; `customer_id` still required. |

## Communications

| Feature | Classification | Evidence |
|---|---|---|
| Email | COMPLETE | Single path through `mail/mail.processor.ts`, Postmark, logged. |
| SMS | COMPLETE (infrastructure) | `sms/sms.service.ts`, Twilio-backed, parallel structure to `mail/`. Actual usage volume/reliability in production is UNTESTED from source alone. |
| Notifications | COMPLETE | `Notification` model; internal notifications confirmed for Estimate Viewed, Invoice payment events. |
| Reminders | COMPLETE | Automation engine — recurring maintenance, payment reminders, estimate expiration reminders. |
| Review requests | COMPLETE | `ReviewRequest`/`Review` models, automation-triggered; `review_received_at` (migration `033`) as the manual completion signal — no Google Business Profile integration exists to automate detection, confirmed by direct search. |

## AI

| Feature | Classification | Evidence |
|---|---|---|
| AI dashboard suggestions | COMPLETE, MODEL VERSION UNVERIFIABLE HERE | `ai/ai-suggestions.service.ts`, Redis-cached (30 min TTL), references `claude-sonnet-4-6` as a model string in source — this is an implementation detail of the app calling Anthropic's API, not a claim this audit is verifying against Anthropic's actual current model lineup. |
| AI assistant (portal chat) | COMPLETE | `portal/services/portal-chat.service.ts`, scoped to the authenticated customer's own data. |
| AI receptionist | IMPLEMENTED — UNTESTED | Twilio-integrated call handling, TwiML building, call summarization, business-hours logic, FAQ answering — all present in `receptionist/`. **No settings UI exists anywhere in `frontend/app`** — confirmed by direct search, not inferred. Never tested against a real live call per every prior audit and nothing in current source contradicts that. |
| AI-related infrastructure | COMPLETE | Redis caching pattern shared across `ai/`, `weather/`, `geocoding/` services. |

## Public Features

| Feature | Classification | Evidence |
|---|---|---|
| Public lead capture | COMPLETE | See Leads above. |
| Quote widget (backend) | COMPLETE | `public/quote-widget/` — full controller/service/DTO/mapper set, writes `estimates.source` for attribution (migration `028`). |
| Quote widget (frontend/embed) | NOT FOUND IN THIS REPO | Direct search for embed/widget HTML or JS output found only `backend/scripts/verify-quote-widget.js` (a verification script, not a consumer-facing embed). If a public embed exists, it is hosted outside this repository — do not assume one exists here. |
| Customer portal | COMPLETE (Phase 2A scope) | See Customer Portal section — Estimates + Invoices only, not the full portal scope docs once described (no Job info, for instance). |

## Settings

| Feature | Classification | Evidence |
|---|---|---|
| Account / Profile | COMPLETE | `frontend/app/settings/profile`. |
| Company | COMPLETE | `frontend/app/settings/company`. |
| Business Defaults | COMPLETE | `frontend/app/settings/business-defaults`. |
| Branding | COMPLETE | `frontend/app/settings/branding` — logo, colors. |
| Money (Payments) | COMPLETE | `frontend/app/settings/payments`. |
| Operations (Automation, SMS, Email, Storage, Estimates) | COMPLETE | Each has a real settings page and backend DTO. |
| Team & Access | NOT IMPLEMENTED | No Users & Roles settings page found — matches the project's stated de-prioritization of multi-employee features; backend guard/role infrastructure exists (`auth/`) but no staff-facing UI to manage it. |
| Platform (Integrations) | COMPLETE | `frontend/app/settings/integrations` + `integration-status.service.ts` (boot-time health for Twilio/Postmark/Stripe/AWS). |
| Support | UNKNOWN | No dedicated support/help settings section was confirmed either way in this pass. |
| Data Management | COMPLETE | Owner-only permanent deletion, company-scoped — see `admin-data/`. |
| Lead Sources | COMPLETE | `frontend/app/settings/lead-sources`. |
| Google Reviews | COMPLETE | Settings page with Place ID + live test + enable toggle. |
| Import/Export | COMPLETE | CSV, moved into Settings from a prior separate location. |
| Appearance | COMPLETE | Dark Mode toggle and related preferences. |

## Administration

| Feature | Classification | Evidence |
|---|---|---|
| Admin data (company-scoped) | COMPLETE | See above — Owner-only, single-company deletion tool with preview endpoints before delete. |
| Tenant management (cross-company) | NOT IMPLEMENTED | No cross-tenant admin surface exists — see Section 3 of PROJECT_CONTEXT.md. |
| User management | PARTIAL | Company invites exist (`auth/`), but no dedicated Users & Roles settings UI (see Settings table above) — backend supports it more than the frontend exposes. |
| Platform controls | NOT IMPLEMENTED | No platform-operator-level controls exist anywhere in the codebase. |

## SaaS Infrastructure

| Feature | Classification | Evidence |
|---|---|---|
| Multi-tenancy (isolation) | COMPLETE | RLS + `withTenantContext`, re-verified this audit. |
| Tenant isolation | COMPLETE | Same evidence. |
| Subscription architecture | NOT IMPLEMENTED | See PROJECT_CONTEXT.md Section 3 — `status`/`stripeCustomerId` fields exist, nothing drives them. |
| Stripe Billing | NOT IMPLEMENTED | Stripe usage found is exclusively for customer-facing invoice payments (`portal/`), not platform subscription billing. Confirmed by reading every file that references Stripe. |
| Feature access (gating by plan) | NOT IMPLEMENTED | No plan/tier model exists to gate against. |
| Company onboarding | COMPLETE | Self-serve registration → `Company` row with `status:'trial'`, real and functional as a signup flow, independent of billing. |

---

## Deployment & Quality Infrastructure

| Item | Classification | Evidence |
|---|---|---|
| Docker | COMPLETE | Multi-stage `Dockerfile`, OpenSSL fix noted in prior docs and still present. |
| CI pipeline | COMPLETE | `.github/workflows/ci.yml` — runs on PRs into `main` only, three jobs: repo-integrity (duplicate source + migration sync checks), backend (install/generate/type-check/build/test), frontend (install/type-check/build). Explicitly documented as a gate, not a deploy mechanism — Railway watches `main` independently. |
| Health checks | COMPLETE | `/health` — real DB + Redis connectivity checks, returns 503 (not 200-with-a-flag) when degraded, shared logic with Settings → Integrations. |
| Security headers | COMPLETE | `helmet()` applied in `main.ts`. |
| Automated tests | PARTIAL — NARROW | **Only 5 real test files exist in the entire repo**, all `.spec.ts` unit tests on pure utility functions: `estimate-profit.util.spec.ts`, `estimate-totals.util.spec.ts`, `job-status.util.spec.ts`, `invoice-status.util.spec.ts`, `arrival-window.util.spec.ts`. **No controller/service integration tests, no e2e tests, no frontend tests exist anywhere in the repo.** CI runs `npm test` (backend only) and would only catch a regression in these 5 utility functions — everything else is verified manually per the project's stated practice (`tsc`/`next build`/manual DB checks), not by an automated suite. This is a materially different picture than "CI Pipeline: verified" might imply on its own. |
| Migration sync check | COMPLETE | `scripts/check-migration-sync.sh`, CI-enforced, keeps `init-scripts/` and `backend/prisma/migrations/` from drifting. |
| Duplicate-source check | COMPLETE | `scripts/check-duplicate-source.sh`, CI-enforced. |
| `prisma:migrate` npm script | MISLEADING / LIKELY VESTIGIAL | See PROJECT_CONTEXT.md Section 2 — defined as `prisma migrate deploy` but everything else about the project's migration story contradicts this being the real path. Recommend removing or updating this script rather than leaving it as a red herring for a future session. |

---

## Notes on classification confidence

Items marked UNKNOWN in this document (Calendar day/week/month
completeness, Maps, Job GPS, Refunds distinct from voids, Support
settings) were not confirmed either way by the evidence gathered in this
pass — they are not claimed as missing, only as unverified. Direct UI
walkthroughs or a targeted follow-up search would resolve each cheaply;
none were treated as COMPLETE or NOT IMPLEMENTED without that follow-up.
