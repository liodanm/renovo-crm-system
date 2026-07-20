# Renovo CRM — Roadmap

Living document for features that are **deliberately deferred**, not
forgotten. Distinct from `PROJECT_STATUS.md` (a regenerated snapshot of
what's built right now) and `CHANGELOG.md` (what's already shipped) —
this is where a planned-but-not-yet-built item gets recorded so it
doesn't get lost between sessions, and isn't accidentally re-proposed as
if it were new.

Entries move from here into `CHANGELOG.md` once actually built.

---

## Current Approved Priority Order (as of the v1.0 readiness audit)

Full detail in `V1_READINESS_AUDIT.md` and `ROADMAP_PHASE_2_PLAN.md` —
this is the short version so it's not lost in a longer document.

1. UI Standardization (StatusBadge consolidation, ConfirmDialog everywhere) + production readiness (real pagination, empty/loading/error state consistency)
2. Real business integrations live (Postmark/Stripe/Twilio credentials — config only, no code)
3. **Lead Management** — new module, new `leads` table
4. **Property Management** — mostly extends what already exists (`photos.property_id` already supports this)
5. **Automation settings UI** — the real engine (follow-ups, recurring reminders, review requests) already exists and already runs on a daily cron; this phase is mostly surfacing it through settings UI

---

## Future Module: Release Management & Versioning

**Status:** Recorded, not started. Explicitly deferred until the CRM
reaches its first production-ready milestone (v1.0.0) — this is
intentional, not an oversight, per direct instruction.

**Trigger to begin work:** When Claude (or whoever picks this up next)
believes the application is genuinely ready for v1.0.0, that should be
raised explicitly before starting this module — not assumed silently.

### Requirements as specified

Semantic Versioning (MAJOR.MINOR.PATCH):
- MAJOR — breaking changes or major platform updates
- MINOR — new features or modules
- PATCH — bug fixes, security fixes, performance improvements

Scope:
1. A single source of truth for the application version, shared by
   frontend, backend, and API — not three independently-maintained
   version strings that can drift apart.
2. Settings → About page: Current Version, Build Number, Build Date,
   Environment (Development/Staging/Production).
3. Automatic version display in the application footer.
4. Automatic CHANGELOG generation per release.
5. Release Notes for every version.
6. Build metadata included in application logs.
7. Git tag and release workflow integrated with GitHub.
8. Optional CI automation to increment versions during official
   releases.
9. A release checklist: testing, deployment, backups, rollback
   procedures.
10. A Release History page for administrators to review previous
    versions and release notes.

### Notes for whoever builds this later

A few things already exist in the codebase that this module should
**reuse, not duplicate**, once it's built:

- `CHANGELOG.md` and `RELEASE_NOTES.md` already exist at the project
  root, hand-maintained. Requirement #4/#5 above should extend these
  real files (or formalize their existing format), not introduce a
  second, parallel changelog system.
- `.github/workflows/ci.yml` already exists (build/type-check/test gate
  on PRs into `main`). Requirement #7/#8 should extend this real
  workflow, not stand up a second one.
- The Settings Framework (`SettingsSectionShell`, the nav config in
  `lib/settings-nav-config.ts`) already exists and is the correct place
  for the About page (#2) and Release History page (#10) — both should
  be built as real settings pages using that existing shell, matching
  every other settings page in the app, not a one-off layout.
- `IntegrationStatusService` (`common/integrations/`) is a working
  example of "one shared service, read by both boot-time logging and a
  Settings page" — the version/build-metadata service this module needs
  should follow the same shape.

### Current honest assessment — is this near v1.0.0 yet?

Not quite, as of the last Production Hardening pass (readiness scored
82%). What's genuinely solid: CI, Docker, health checks, structured
logging, RLS/tenant isolation (fully audited), rate limiting, and every
core business module (Customers, Estimates, Jobs, Scheduling, Service
Catalog, Settings, Invoices, Payments, PDF/Email, Reports) built, tested,
and connected end-to-end.

What's still open before v1.0.0 would be honest to call itself
"production-ready" rather than "production-capable":
- Real Postmark/Stripe/Twilio credentials aren't live anywhere yet —
  the code is correct and tested, but nothing has actually sent a real
  email, processed a real card, or texted a real customer in production.
- No monitoring/error-reporting service (no Sentry/APM) — structured
  logs exist, nothing aggregates or alerts on them yet.
- No optimistic locking anywhere in the schema.
- List-endpoint pagination is partial (Customers has real page/pageSize
  pagination; Invoices/Jobs/Payments have a safety-net `LIMIT 200` but
  not full pagination yet).

Recommendation: treat these four items as the real pre-v1.0.0 checklist,
separate from this Release Management module itself. Once they're
closed, that's the moment to flag v1.0.0 readiness explicitly and
propose starting this module.
