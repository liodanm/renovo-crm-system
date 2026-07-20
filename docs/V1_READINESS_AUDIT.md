# Renovo CRM — Pre-v1.0 Production Audit & Roadmap

Audit performed by direct inspection of the current codebase — routes, components, nav config, and status-rendering implementations were read directly, not assumed. Where a finding below is "verified," it was checked this session; where it draws on earlier work in this project (RLS, PDF/email, tenant isolation), that's noted as prior, not re-verified today.

---

## Phase 1 — Full Application Audit

| Module | Real state |
|---|---|
| Dashboard | Exists at `/`, includes a notifications card |
| Customers, Estimates, Jobs, Scheduling, Invoices, Payments, Service Catalog, Reports, Settings | Real, built, functional — confirmed by both route existence and the deep work already done on each this project |
| **Leads, Properties, Automation, Recurring Services, Reviews, Marketing, Assets, Support** | **No pages exist at all.** The sidebar honestly marks these `comingSoon: true` — this is accurate self-reporting, not a hidden gap |
| Global search | **Does not exist anywhere in the app** |
| Notifications | Only a dashboard card — no bell icon, no notification center, no real-time delivery |
| Customer Portal, PDF, Email | Real and functional (built and verified in prior sessions) |
| AI Receptionist | Backend exists (referenced in integration status checks); no dedicated settings UI |

## Phase 2 & 3 — UX Consistency and Component Reuse Audit

The clearest, most concrete finding of this whole audit:

**Four independently-written status badge implementations exist**, each with its own hand-maintained color map and slightly different sizing:
- `PAYMENT_STATUS_STYLES` in `lib/api/payments.ts` (`px-2.5 py-0.5 text-xs`)
- `STATUS_STYLES` inline in `jobs/page.tsx` (same sizing, separate object)
- Invoices' own inline status rendering
- The new `StatusBadge` component I just built for Estimates (`px-3 py-1 text-sm` — **a fourth, subtly different size**, not a fix)

**Two separate action-bar implementations exist**: Jobs has its own `FieldActionBar` (built earlier, field-crew-specific — start/pause/resume/complete), and the new generic `ActionBar` I built for Estimates. These solve genuinely different problems (field operations vs. document lifecycle), so this may not be true duplication — but they should share the same underlying button/spacing primitives, and currently don't.

**Confirmation dialogs are inconsistent**: Estimates now uses the new custom `ConfirmDialog`; Invoices' Void action still uses the browser's native `window.confirm()`. A real, visible inconsistency a user would notice switching between the two pages.

**Recommendation**: a single `StatusBadge` color-map registry (one component, one size, per-entity color maps only) and migrating every module's confirm actions to the real `ConfirmDialog` should happen before v1.0 — this is cheap, high-visibility, and exactly the kind of polish that separates "built" from "feels professional."

## Phase 4 — Workflow Audit

The full Lead → Customer → Estimate → Portal → Job → Invoice → Payment chain is real starting from Customer (Lead capture doesn't exist yet — see Phase 1). From Customer onward, every step is genuinely wired, not simulated. The one workflow gap worth flagging: **there's no way to create a Lead before it becomes a Customer** — every job today starts by manually creating a Customer record, even for someone who just submitted a contact form and hasn't been qualified yet. For a pressure-washing business fielding inbound calls/web forms, this is a real, felt gap, not a nice-to-have.

## Phase 5 — Mobile Experience Audit

Genuinely light, fairly even mobile tuning across the app — a handful of responsive breakpoint classes per page, no page dramatically worse than another. The new `ActionBar` correctly wraps (`flex-wrap`) rather than overflowing on narrow screens. Nothing here is broken, but nothing is mobile-optimized either — this reads as "not yet a priority" rather than "regressed," consistent everywhere I checked.

## Phase 6 — Settings Audit

**Real and complete**: Profile, Company, Business Defaults, Branding, Payments, Email, SMS, Storage.
**Honestly marked `comingSoon`**: API Keys, Chemical/Equipment Inventory, Automation settings UI, Users & Roles, Security (2FA/sessions), Notifications preferences, Integrations, AI Assistant config, custom Reports, Appearance, Backups, Help & Support, **About** (the exact page the Release Management roadmap item already calls for).

**Priority for v1.0**: Users & Roles is the one gap here with real business weight — right now there's no UI to invite a team member or change someone's role.

## Phase 7 — Performance Audit

No new profiling was run this session (would require a live running instance, which this sandbox can't boot). Based on code inspection: the `Invoices`/`Jobs`/`Payments` list endpoints have a safety-net `LIMIT 200` but not real pagination (flagged in an earlier hardening pass, still open). No obvious N+1 patterns found in what was inspected this session, but a full query-by-query audit wasn't repeated here — that was done thoroughly in the last two stabilization sprints.

## Phase 8 — Production Readiness Audit

Not re-verified this session — this is the exact subject of the last two hardening passes (CI, Docker, RLS, env validation, health checks, security headers all confirmed real and working then). No new regressions found in what was inspected today.

---

## Phase 9 — Version 1.0 Readiness Classification

**Critical (blocks v1.0)**
- None found that aren't already known: the real Postmark/Stripe/Twilio credentials still need to go live in Railway (a config step, not a code gap).

**High Priority**
- Consolidate the 4 status-badge implementations into 1.
- Migrate remaining `window.confirm()` calls to the real `ConfirmDialog`.
- Users & Roles settings page (inviting/managing team members has no UI today).
- Real pagination on Invoices/Jobs/Payments lists (currently a safety-net limit only).

**Medium Priority**
- Lead capture (a lightweight intake form before "Customer" exists).
- Global search.
- Real-time notification center (beyond the dashboard card).

**Nice to Have**
- Mobile-specific layout tuning beyond current responsive baseline.
- Automation settings UI (the backend and event logging already work; only the settings page is missing).

**Future Version (1.1+)**
- Recurring Services, Reviews, Marketing, Assets/Inventory tracking, AI Receptionist settings UI, custom report builder, Release Management & Versioning (already recorded on the roadmap for post-v1.0).

---

## Phase 10 — Prioritized Roadmap

| # | Item | Effort | Business Impact | Blocks v1.0? | Risk |
|---|---|---|---|---|---|
| 1 | Consolidate status badges into one component | Small | Visible polish, low risk | No, but cheap and high-value | Low |
| 2 | Replace remaining `window.confirm()` with `ConfirmDialog` | Small | Consistency polish | No | Low |
| 3 | Users & Roles settings page | Medium | Real operational need — inviting staff | **Yes-adjacent** (a solo operator can skip it; any team does need it) | Low |
| 4 | Real pagination on Invoices/Jobs/Payments | Small–Medium | Prevents a real future scaling issue | No | Low |
| 5 | Lead capture / intake | Medium | Fills the one real workflow gap found | No | Medium (new module, new schema) |
| 6 | Configure live Postmark/Stripe/Twilio credentials | Small (config only) | Flips 3 built-but-dormant systems live | **Yes** | Low |
| 7 | Global search | Medium–Large | Convenience, not launch-blocking for a single-business deployment | No | Medium |
| 8 | Notification center | Medium | Nice UX, not launch-critical at solo/small-team scale | No | Medium |

**My recommendation for your specific launch** (a working, real business, not a demo): items 1, 2, 4, and 6 are the genuinely cheap, high-value, low-risk items — do those first. Item 3 (Users & Roles) only matters the moment you're not the only person using this. Everything else is real, but not what's between you and using this for real work.

I have not written any code — this is the audit and roadmap only, exactly as instructed. Let me know which priorities you approve before I start building.
