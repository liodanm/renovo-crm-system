# ROADMAP.md

This document does not select a next feature. It lays out current state,
known hardening needs, potential future directions, and questions that
require a product decision from the project owner. See
`PROJECT_STATUS.md` for the evidence behind every claim here.

---

## Current State

The core operational loop — Lead/Customer → Estimate → Job → Schedule →
Complete → Invoice → Payment — is fully built, connected, and verified
against source at every step (Section: Workflow 1 & 2 in
`WORKFLOW_MAP.md`). Customer Portal covers Estimates and Invoices, not
Jobs. AI Receptionist has a real backend with no way to configure or
test it yet. SaaS billing/tenant-management infrastructure does not
exist beyond data-layer tenant isolation. Automated test coverage is
narrow — 5 unit tests total, no integration or e2e tests anywhere.

---

## Hardening Queue

Ordered roughly by leverage (small effort / real risk reduction), not by
urgency ranking — see Section 8 (Real Open Issues) for severity.

1. **Route Invoice Void and Payment Void through `ConfirmDialog`**
   instead of browser `confirm()`. Small, contained, closes a
   long-standing consistency gap (ADR-010 exception).
2. **Add automated test coverage for the Stripe webhook path**
   (`handleStripeWebhook`, both success and failure events) — this is
   the highest-stakes untested path in the app (money + external
   signature-verified webhook) and currently has zero test coverage.
3. **Clarify or remove the vestigial `prisma:migrate` npm script**
   (`backend/package.json`) — it claims `prisma migrate deploy` but
   nothing about the project's actual migration path uses Prisma's
   migration engine. Leaving it risks a future session trusting it.
4. **Confirm Railway's Pre-Deploy Command is actually wired to
   `scripts/run-migrations.sh`** — the script is real and correct, but
   its production wiring isn't verifiable from the repo alone.
5. **Audit Customer Portal auth routing specifically** — not because
   anything is currently broken, but because this exact area (staff auth
   intercepting portal routes, a DTO missing validation decorators) has
   produced multiple real bugs recently. A deliberate pass now is cheaper
   than the next bug report.
6. **Resolve the several UNKNOWN items in `PROJECT_STATUS.md`** with
   direct verification rather than leaving them ambiguous: Calendar
   day/week/month completeness, Maps UI, Job GPS capture, Refunds vs.
   voids, Support settings section, whether scheduling triggers a
   customer notification, and whether the AI integration (Anthropic API
   calls) degrades gracefully when unconfigured like every other
   integration does.

---

## Product Opportunities

Listed as *possibilities* only — not a recommendation, not ranked, not a
decision. Each would need explicit sign-off before any work starts.

- Extend the Customer Portal to include Job information (currently
  Estimates + Invoices only).
- Build a settings UI and live-call validation path for the AI
  Receptionist, unlocking a backend that already exists.
- Locate or build a frontend/embed for the Quote Widget backend, which
  currently has no confirmed consumer.
- Add broader automated test coverage beyond the 5 existing unit tests —
  particularly integration tests around tenant isolation and portal
  ownership checks, given how much of the app's security model depends
  on both being correct everywhere.
- If SaaS resale is still the direction, design and build actual
  subscription/billing infrastructure — today's `Company.status` field
  is a placeholder, not a working state machine.
- Build a Users & Roles settings UI to expose the backend permission
  system that already exists but has no staff-facing screen.
- Give `appointments` a real Prisma model, closing the type-safety gap
  that the rest of the app doesn't have — would need careful handling
  given the volume of existing raw SQL against it.

---

## Pending Product Decisions

Questions that cannot be resolved technically — they need your call.

1. **ADR-007 — the manual `convert-to-job` endpoint.** Deprecate it now
   that acceptance auto-creates the job, or keep it intentionally as a
   manual override/repair path? This has carried unresolved across
   three documentation audits now. It's a five-minute decision, not a
   technical unknown.
2. **Is SaaS resale (to other pressure-washing companies) still the
   actual direction**, or is this now purpose-built for Relentless
   Pressure Wash specifically? This materially changes whether the
   billing/subscription gap in Section 3 of `PROJECT_CONTEXT.md` is an
   urgent gap or irrelevant scope that shouldn't be built at all.
3. **Does the Quote Widget need a frontend built**, or does one already
   exist outside this repository (a separate marketing site, a
   third-party embed host, etc.)? Determines whether "build the embed"
   belongs on any future list at all.
4. **Is a customer-facing Job-status view in the Portal wanted**, or is
   Estimates + Invoices the intended full scope of the portal?
5. **How much automated test coverage is actually wanted going
   forward?** The project has clearly prioritized manual/live-database
   verification over automated tests so far (per its own stated
   practice) — worth confirming whether that's a deliberate ongoing
   choice or something to invest in changing now that the app is larger.
