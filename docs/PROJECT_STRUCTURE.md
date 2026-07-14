# Project Structure & External Accounts

Generated from the actual project tree at RC1 export time, not written
from memory — 142 real backend + frontend source files across 13 backend
modules.

## Folder structure

```
renovo-crm/
├── .gitignore                    # excludes .env, node_modules, build output
├── README.md                     # project overview
├── RELEASE_NOTES.md              # what's in this release, and what isn't
├── docker-compose.yml            # one-command local environment
├── renovo_crm_schema.sql         # base database schema (32 tables)
│
├── init-scripts/                 # flat, pre-ordered copy of schema + migrations,
│                                  # for Postgres's Docker auto-init on first run
│
├── backend/
│   ├── Dockerfile                # multi-stage production build
│   ├── .dockerignore
│   ├── .env.example              # every config variable, documented inline
│   ├── package.json
│   ├── tsconfig.json
│   ├── scripts/
│   │   ├── backup-database.sh    # daily automated backup (tested end-to-end)
│   │   └── test-restore.sh       # verifies a backup actually restores
│   ├── prisma/
│   │   ├── schema.prisma         # the Prisma-side schema definition
│   │   ├── seed.sql              # demo data — real, working login included
│   │   └── migrations/           # 7 migrations, numbered, run in order
│   └── src/
│       ├── main.ts               # entry point: env validation, logging, filters
│       ├── app.module.ts         # wires every feature module together
│       ├── auth/                 # complete — registration, login, OAuth, RBAC
│       ├── customers/            # complete — CRUD, duplicates, notes, files
│       ├── dashboard/            # backend complete, no frontend yet
│       ├── automation/           # backend complete (real SMS/email, cron), no frontend
│       ├── receptionist/         # AI phone receptionist backend, Twilio-integrated
│       ├── portal/               # customer portal backend, no frontend yet
│       ├── leads/                # public lead-capture endpoint
│       ├── ai/                   # AI suggestion logic (feeds the dashboard)
│       ├── mail/                 # Postmark-backed transactional email
│       ├── weather/              # feeds the dashboard's weather widget
│       ├── health/               # /health endpoint, real DB+Redis checks
│       ├── config/               # environment/JWT configuration
│       └── common/               # shared: Prisma client, Redis, logging, storage, filters
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.local.example
│   └── app/
│       ├── (auth)/               # login, register, forgot/reset password, etc.
│       └── customers/            # customer list, detail, duplicate resolution
│           # this is the full extent of the connected frontend today —
│           # see docs/PROJECT_STATUS.md for what has no UI yet
│
└── docs/
    ├── GITHUB_IMPORT_GUIDE.md    # start here — step 1
    ├── DEPLOYMENT_GUIDE.md       # step 2 — local dev through live production
    ├── ENVIRONMENT_VARIABLES.md  # every variable, where to get real values
    ├── BACKUP_AND_RECOVERY.md    # tested backup/restore procedure
    ├── GETTING_STARTED.md        # local Docker setup, condensed
    └── PROJECT_STATUS.md         # feature-by-feature: what's real, what isn't
```

## External accounts required

None of these are required to get the application *running* — every one
degrades gracefully and logs exactly what's missing at startup (see
`main.ts`'s integration-status report). They're required for the specific
feature each one powers to actually do anything.

| Account | Powers | Required for basic operation? |
|---|---|---|
| None — just Postgres + Redis | The entire core app: auth, customer management, database | Yes, but both run inside Docker Compose locally, and as managed add-ons on Railway/Render in production — no separate account needed |
| Twilio | SMS: automation reminders, AI phone receptionist | No — automation still runs and logs, just doesn't send texts |
| Postmark | All transactional/automation email | No — same graceful degradation |
| Stripe | Customer portal invoice payments | No — only matters once the portal has a frontend |
| AWS (S3) | Photo/document uploads | No — only the customer photo/document upload feature needs this |
| Google/Microsoft OAuth (optional) | "Sign in with Google/Microsoft" for staff | No — email/password login works without this |
| GitHub | Where your code lives, what Railway deploys from | Yes, for the deployment path in `docs/DEPLOYMENT_GUIDE.md` |
| Railway (or Render) | Hosts the live production app | Yes, for a real production deployment |

Full account-creation steps (exact console navigation, minimal IAM
policies, real cost estimates) for each of Twilio/Postmark/Stripe/AWS are
in `docs/ENVIRONMENT_VARIABLES.md` — not duplicated here to avoid the two
documents drifting out of sync with each other.
