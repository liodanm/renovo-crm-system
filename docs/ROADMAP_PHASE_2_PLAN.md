# Renovo CRM — Roadmap Update & Implementation Plan
## (Planning only — no code written, per instruction)

Two things worth knowing before anything else, found by inspecting the actual code rather than assuming:

1. **Automation's real engine already exists and is already running.** `runEstimateFollowups`, `runRecurringReminders`, and `runReviewRequests` are real, working methods, and a `@Cron('0 9 * * *')` job already calls them daily. Priority #3 is much smaller than it looks — it's "build the missing settings UI and verify the timing is right," not "build automation."
2. **`photos.property_id` already exists** in the schema. Property-level photos need zero schema changes — just a service method reusing the existing `photos` table.

---

## Updated Roadmap Order (per your approval)

1. UI Standardization + Production Readiness
2. Real Business Integrations (config only)
3. **Lead Management**
4. **Property Management**
5. **Automation (settings UI + verification)**

---

## 1. UI Standardization & Production Readiness

**Database changes:** None.

**Backend modules affected:**
- `InvoicesService.findAll`, `JobsService.findAll`, `PaymentsService.findAll` — replace the current safety-net `LIMIT 200` with real `page`/`pageSize` pagination and a total count, matching the pattern `CustomersService` already uses correctly.

**Frontend affected:**
- New consolidated `StatusBadge` (one component, one size) replacing the 4 existing implementations (Payments' `PAYMENT_STATUS_STYLES`, Jobs' inline `STATUS_STYLES`, Invoices' inline rendering, and my own recent Estimates one).
- Every `window.confirm()` call (Invoices' Void, and any others found during implementation) replaced with the real `ConfirmDialog`.
- Pagination controls added to Invoices/Jobs/Payments list pages, reusing Customers' existing pattern.
- A pass through empty/loading/error states across all list pages for consistency — no new components expected, just applying the ones that already exist evenly.

**Migration risk:** None — this phase touches no schema.

---

## 2. Real Business Integrations

**Database changes:** None — every credential involved (Postmark, Stripe, Twilio) is correctly an environment variable, not a database field, and stays that way.

**What actually needs to happen:**
- Set real `POSTMARK_SERVER_TOKEN` / `MAIL_FROM_ADDRESS` in Railway.
- Set real `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`, and register the webhook URL in the Stripe dashboard pointing at your Railway backend.
- Set real `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` if SMS reminders matter to you (Priority #3 depends on this being live).
- Verify via the real test-send buttons already built in Settings → Email/SMS.

**Migration risk:** None. **Backend/frontend code changes:** None expected — this is configuration only.

---

## 3. Lead Management

**Database changes (new, additive):**
- New `leads` table: `id, company_id, first_name, last_name, phone, email, source, status, notes, converted_customer_id (nullable), created_at, updated_at` — RLS-protected, same pattern as every other tenant table.
- `source` as a `CHECK`-constrained enum: `google_business_profile`, `phone_call`, `referral`, `website`, `other`.
- `status`: `new`, `contacted`, `qualified`, `converted`, `lost`.
- A `lead_status_history` table, same shape as `estimate_status_history` — for the same audit consistency reasoning, and because "why did this lead go cold" is genuinely useful data for a service business.

**Backend modules affected:**
- New `LeadsModule` (controller, service, DTOs) — new code, not an extension of anything existing.
- `convertToCustomer(leadId)` — creates the real `Customer` (and optionally a first `Property`) from the lead's data, stamps `converted_customer_id`, writes to history. This is the one place Leads and Customers actually connect.
- New permission: `leads.write` / `leads.read` (or reuse `customers.write` — a real decision to make before building, not during).

**Frontend affected:**
- Real `/leads` list and detail pages, replacing the current `comingSoon` stub.
- "Convert to Customer" action on the lead detail page, following the same Action Center pattern (confirmation dialog, status history timeline) already built for Estimates — reused, not reinvented.
- Sidebar nav: remove `comingSoon` from Leads.

**Migration risk:** Low. Purely additive — a new table with no foreign keys pointing *into* existing tables that would need backfilling. The only real design decision: whether "a phone call creates a Lead" means a person manually taps a button when they hang up (simple, immediate), or eventually integrates with a phone system to auto-log calls (a real future integration, not v1 scope). I'd recommend manual entry for now — it's the lower-risk, faster path to something you'd actually use this week.

---

## 4. Property Management

**Database changes (small, additive):**
- `properties.roof_type TEXT` — genuinely missing today (there's `surface_types` as a JSONB array, but no dedicated roof-type field for the kind of detail an estimate needs).
- `properties.notes TEXT` — general notes, distinct from the existing `access_notes` (gate codes, dog warnings) which serves a different purpose.
- **No changes needed for photos** — `photos.property_id` already exists.

**Backend modules affected:**
- Extend `PropertiesService` (currently only reachable through `CustomersService`) with: photo list/upload scoped by property (reusing the same upload logic `job-photos.service.ts` already has — this should be extracted into a shared `PhotosService` both Job and Property photos call, not a second copy of the S3 upload code), and a `getServiceHistory(propertyId)` method — a read-only query joining Jobs/Invoices by `property_id`, not new stored data.

**Frontend affected:**
- A real property detail page (doesn't exist today — properties are only ever a dropdown inside the Estimate/Job forms right now, never their own page).
- Photo gallery component — reused from Jobs' existing photo display, not rebuilt.
- Service history timeline — reuses the `StatusTimeline`/activity-feed pattern already built for Estimates.

**Migration risk:** Low. Two new nullable columns on an existing table — no backfill required, no risk to existing rows.

---

## 5. Automation

**Database changes:** Likely none — `automation_settings` (from the original automation migration) already has the toggle/timing columns this needs. Needs verification during implementation, not assumed.

**Backend modules affected:** Minimal — the real engine already exists and already runs daily. The only gap is confirming `AutomationSettingsService` (if it exists) actually exposes the `afterDays`/`intervalMonths`/`delayDays` values as editable, and wiring `AutomationController` if those routes are incomplete.

**Frontend affected:**
- A real Settings → Automation page (currently `comingSoon`), with toggles and interval controls for the three automations, following the same `SettingsSectionShell` pattern every other settings page already uses.

**Migration risk:** Very low — this is almost entirely surfacing existing backend capability through UI that doesn't exist yet, not new business logic.

---

## What I'd flag before you commit to this order

Property Management and Automation are both smaller than they look, precisely because so much groundwork already exists. Lead Management is the one genuinely new module in this batch — new table, new module, new pages. If you want the fastest path to a noticeably different day-to-day experience, Leads is where the real new work is; the other two are mostly "finish what's already there."

Ready to proceed in this order once you confirm — starting with Phase 1 (UI Standardization).
