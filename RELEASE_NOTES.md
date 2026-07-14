# Renovo CRM — Release Candidate 1 (v0.1.0-rc.1)

## What "RC1" means for this project

Not "feature complete, final polish." This tags the current, real,
audited state of the codebase — what's genuinely built, tested, and
internally consistent — as a stable point to export and build from next,
distinct from the exploratory, add-a-feature-per-turn pace of everything
before it. The version number (`0.1.0-rc.1`, not `1.0.0`) is deliberate:
this reflects actual maturity, not aspiration. A full accounting of what
is and isn't ready is in `docs/PROJECT_STATUS.md`.

## What changed in this pass

- **Frontend was type-checked and build-tested for the first time in this
  entire project.** Every other verification pass across this whole
  conversation checked the backend only. Ran `tsc --noEmit` and
  `next build` against the real frontend for the first time — both came
  back clean: zero type errors, all 13 routes compile and generate
  correctly.
- **Version numbers corrected.** Both `package.json` files claimed
  `1.0.0` — misleading for a system where, per `docs/PROJECT_STATUS.md`,
  core features (Estimates, Scheduling, Jobs, Invoices) have no staff-facing
  API at all yet. Set to `0.1.0-rc.1` to actually reflect that.
- **Dead code sweep**: checked for orphaned files never imported anywhere,
  leftover test/debug artifacts, and TODO/FIXME markers. Found none —
  the one file flagged by the automated check (`main.ts`) is a correct
  false positive (it's the application entry point, never meant to be
  imported by anything else).
- **Backend re-verified**: same 5 known, pre-existing, environment-caused
  type errors (Prisma client generation is blocked in every sandbox this
  project has been built in — documented at every prior delivery), zero
  new issues.

## What's in this release, precisely

See `docs/PROJECT_STATUS.md` for the complete, feature-by-feature
breakdown (Backend/Database/API/Frontend/Connected/Production-Ready for
all 17 major areas) — that document is the source of truth for scope, not
a summary repeated and potentially drifted from here. The short version:
**Authentication and Customer Management are genuinely complete and
production-ready — real backend, real database, real API, real connected
frontend, all tested.** Automation, Payments infrastructure, File
uploads, AI backend logic, the Receptionist, and the Customer Portal
backend are real, tested, and running — but none of them have a
staff-facing UI yet. Estimates, Scheduling, Jobs, Invoices, and Reports
have no backend API for staff use at all — this is the actual scope gap
before daily business use, not a polish gap.

## Export contents

- `backend/` — NestJS API, Dockerfile, migrations, scripts
- `frontend/` — Next.js staff app (auth + customer management)
- `docker-compose.yml`, `init-scripts/` — one-command local environment
- `docs/` — deployment guide, environment variable reference, backup/
  recovery runbook, project status report
- `renovo_crm_schema.sql` — base database schema
- `.gitignore` — prevents secrets from ever being committed
- `.env.example` — configuration template (no real secrets, ever)

## Explicitly not in this release

Estimates/Scheduling/Jobs/Invoices staff CRUD, Reports (backend or
frontend), a unified Settings screen, the customer portal frontend, the
dashboard frontend, an automation configuration UI, Stripe failed-payment
handling, CI, and the Audit Trail system (designed, approved for later,
intentionally not started). All of these are real, named gaps — not
implied to exist and quietly missing.
