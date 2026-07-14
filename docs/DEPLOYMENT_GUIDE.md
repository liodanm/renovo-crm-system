# Deployment Guide — Zero to Live Production

Written for someone who hasn't deployed a web application before. Every
step is explained, not just listed. Follow it in order.

## Before anything else: what you're actually deploying

**Read this section even if you skip everything else.** This project has
two separate things in it, and they are not the same:

1. **The real backend + a basic staff frontend** (this guide deploys
   this) — the actual database, business logic, and API for
   customers/estimates/invoices/scheduling/payments/automation/AI, plus a
   simple web frontend for staff login, registration, and a customer list.
   **This is what actually runs your business day to day once deployed.**
2. **The full-featured CRM interface** (scheduling calendar, invoice
   builder, automation dashboard, AI assistant chat, reports) — this
   exists as an interactive prototype you use directly inside Claude, not
   as part of what this guide deploys to a server. It's not wired up to
   talk to the real backend yet.

**Why this matters**: after following this guide, you'll have a real,
working, production database and API — genuinely useful today for storing
real customer/job/invoice data via direct API calls or the basic staff
frontend. You will *not* see the rich scheduling/invoicing screens from
the Claude conversation live on a website — building that connection is
future work, not part of "deploy what exists." Better to know that now
than be surprised at the end of this guide.

---

## Part 0: Accounts and tools you'll need

Create these now, or as you reach the step that needs them — nothing here
blocks you from starting.

| What | Why | Cost |
|---|---|---|
| A GitHub account | Where your code lives, and what Railway deploys from | Free |
| A Railway account (railway.app) | Hosts your live production app (recommended — see `docs/GETTING_STARTED.md` for why a managed platform beats self-hosting for a one-person business) | ~$5-20/month depending on usage |
| Docker Desktop | Runs the database and app on your own computer for testing | Free |
| A code editor (e.g. VS Code) | For editing one file (your `.env`) | Free |

**Twilio, Postmark, Stripe, and AWS accounts** (for SMS, email, payments,
and photo storage) are **not needed to get this running** — every one of
those features gracefully turns itself off without them, and the app logs
exactly that at startup so you always know what's live. Create these
later, whenever you're ready for that specific feature — full instructions
are in `docs/ENVIRONMENT_VARIABLES.md` when you get there.

---

## Part 1: Run it on your own computer first

**Never skip straight to production.** Testing locally first means any
mistake costs you nothing and takes seconds to fix, instead of happening
on a live system.

### 1. Install Docker Desktop

Docker is a tool that runs your database, cache, and application inside
lightweight, isolated "containers" — the practical benefit for you is
that you don't have to manually install and configure Postgres and Redis
on your computer; Docker handles that from a single config file already
written for you.

Download and install Docker Desktop. Open it once after installing — you
should see a Docker icon appear in your system tray/menu bar. That means
it's running.

### 2. Get the code onto your computer

If you received this as a `.zip` file, extract it to a folder — e.g.
`Documents/renovo-crm`. Open a terminal (Terminal on Mac, PowerShell or
Command Prompt on Windows) and navigate into that folder:

```bash
cd path/to/renovo-crm
```

### 3. Create your local environment file

The application needs a file called `.env` with configuration values
(database connection info, security keys, etc.) — this file is
intentionally **not** included in what you received, because it's meant
to hold secrets specific to you. Create it from the provided template:

```bash
cp backend/.env.example backend/.env
```

Now generate three real random security keys — these are what keep
login sessions secure. Run this command **three separate times**:

```bash
openssl rand -base64 48
```

(No `openssl` on Windows? Use
`node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`
instead — it does the same thing.)

Each time it prints a long random string. Open `backend/.env` in your
code editor and paste one string into each of these three lines
(three **different** strings — not the same one copy-pasted):

```
JWT_ACCESS_SECRET=<paste first string here>
JWT_REFRESH_SECRET=<paste second string here>
PORTAL_JWT_SECRET=<paste third string here>
```

Leave everything else in `.env` as-is for now — `DATABASE_URL` and the
`REDIS_*` values get automatically overridden to point at the right
places when you start things up in the next step.

### 4. Start everything

```bash
docker compose up -d
```

The `-d` means "run in the background" so you get your terminal back.
The first time you run this, Docker downloads the database/cache
software and builds your application — this can take a few minutes.
You'll see a lot of text scroll by; that's normal.

### 5. Check it actually worked

```bash
curl http://localhost:4000/health
```

You should see something like:
```json
{"status":"ok","timestamp":"...","checks":{"database":"ok","redis":"ok"}}
```

If you see `"status":"degraded"` instead, something isn't connected
correctly — see the Troubleshooting section at the end of this guide.

You can also check exactly which optional features (SMS, email,
payments, file storage) are currently active:

```bash
docker compose logs backend | grep -A6 "Integration status"
```

Since you haven't set up Twilio/Postmark/Stripe/AWS yet, everything here
should say `[NOT CONFIGURED]` — that's expected and fine. The app works
without them; those specific features just won't do anything yet.

### 6. Try logging in

The basic staff frontend isn't started by Docker Compose (it's a
separate piece you'd run with `npm run dev` inside `frontend/` if you
want to click through it locally) — but you can register a real account
directly against the API right now to confirm the whole system actually
works end to end:

```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "Relentless Pressure Wash",
    "email": "you@yourbusiness.com",
    "password": "ChooseARealPasswordHere123!",
    "firstName": "Your",
    "lastName": "Name"
  }'
```

A successful response includes your new account's details — that means
you have a real company and a real user in a real database, right now,
on your own computer. This is genuinely your business's data model
working, not a simulation.

**Stop here and get this working before moving to Part 2.** If `curl
http://localhost:4000/health` doesn't return `"status":"ok"`, production
deployment will just have the same problem somewhere you can't debug as
easily.

---

## Part 2: Prepare for production

A few things are different for a real, live deployment than for testing
on your own computer.

### Generate a second, different set of secrets

**Never reuse your local `.env` secrets in production.** Run
`openssl rand -base64 48` three more times to get a fresh
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `PORTAL_JWT_SECRET` for
production specifically — you'll paste these into Railway's dashboard in
Part 3, not into any file.

### Decide which integrations you want live on day one

You can launch with all four (Twilio/Postmark/Stripe/AWS) unconfigured
and add them later — nothing breaks. If you want SMS reminders, email,
online payments, or photo uploads working from day one, follow the
account-creation steps in `docs/ENVIRONMENT_VARIABLES.md` now and have
those keys ready for the next step.

### Put your code on GitHub

Railway deploys from a GitHub repository, not a zip file. If you haven't
already:

```bash
cd path/to/renovo-crm
git init
git add .
git commit -m "Initial commit"
```

Then create a new **private** repository on GitHub (github.com → the "+"
icon → New repository → check "Private"), and follow GitHub's own
instructions on that page for pushing an existing local repository to it.

**Double-check `.env` is not being committed** — run `git status` and
confirm `.env` does *not* appear in the list of files to be committed
(it shouldn't, `.gitignore` is already set up to exclude it — but this is
worth actually looking at once, since a leaked secret is the single most
consequential mistake possible at this step).

---

## Part 3: Deploy to Railway

1. Go to railway.app and sign up (GitHub login is the fastest option,
   and conveniently sets up the GitHub connection you need in the next
   step automatically).
2. **New Project** → **Deploy from GitHub repo** → select the repository
   you just pushed.
3. Railway will try to auto-detect how to build your app. Click into the
   new service it created, go to **Settings**, and set:
   - **Root Directory**: `backend`
   - Railway will find the `Dockerfile` in that folder automatically and
     use it — no further build configuration needed.
4. **Add a database**: in your Railway project, click **New** → **Database**
   → **PostgreSQL**. Railway provisions and manages this for you — no
   installation, no manual backups to configure yourself for the database
   engine itself (though see Part 5 below for *your data's* backups,
   which is a different thing).
5. **Add Redis**: same process, **New** → **Database** → **Redis**.
6. **Set your environment variables**: click into your backend service →
   **Variables** tab. Add every variable from `backend/.env.example`.
   For `DATABASE_URL` and `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`,
   Railway can reference the database services you just created directly
   (click the "+" next to a variable value and select "Reference another
   service's variable") — this means you never manually copy a connection
   string, and it stays correct automatically if Railway ever rotates
   anything.
7. Set `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PORTAL_JWT_SECRET` to
   the **new** production secrets you generated in Part 2 — not your
   local ones.
8. Set `NODE_ENV=production`.
9. Click **Deploy**. Watch the build logs — this is running the exact
   same `Dockerfile` you tested locally, so if Part 1 worked, this should
   too.

### Run the database setup, once

Your production database starts empty. From your own computer, using the
`DATABASE_URL` Railway shows you for the Postgres service (Postgres →
Variables tab → copy `DATABASE_URL`):

```bash
psql "<paste production DATABASE_URL here>" -f renovo_crm_schema.sql
for f in backend/prisma/migrations/*.sql; do
  psql "<paste production DATABASE_URL here>" -f "$f"
done
```

This creates every table your application needs, in the correct order —
the exact same files that initialize your local Docker setup automatically,
run manually here since your production database doesn't have that
auto-init step.

### Verify production is actually working

Railway gives your service a public URL (Settings → Networking → a
`*.up.railway.app` address, or your own custom domain if you set one up).

```bash
curl https://your-app.up.railway.app/health
```

Same check as Part 1 — should return `"status":"ok"`. If it does, you
have a real, live, production system.

---

## Part 4: Point your domain at it (optional but recommended)

In Railway: your service → **Settings** → **Networking** → **Custom
Domain** → enter your domain (e.g. `app.relentlesspressurewash.com`).
Railway shows you a DNS record to add — log into wherever you bought your
domain (GoDaddy, Namecheap, Google Domains, etc.), find DNS settings, and
add the record exactly as Railway shows it. This usually takes a few
minutes to an hour to take effect. Railway issues a free TLS certificate
(the padlock icon in browsers) for you automatically once it does.

**After this, update your environment variables** (`FRONTEND_URL`,
`PUBLIC_API_BASE_URL`, `PORTAL_URL`) to use your real domain instead of
the Railway-provided one — anything pointing Twilio/Stripe webhooks
needs the real, final URL.

---

## Part 5: Set up backups — do this before you rely on this system

`docs/BACKUP_AND_RECOVERY.md` has the full script and reasoning. The
short version for Railway specifically: Railway supports scheduled
**Cron Jobs** directly in its dashboard (New → Cron Job) — point it at
`backend/scripts/backup-database.sh` with the same environment variables
as your main service, scheduled daily. This was tested for real against
a live database during development — a genuine dump/restore cycle was
run and verified to correctly restore all data, including security
policies — not just written and assumed to work.

---

## Post-deployment checklist

- [ ] `curl https://your-domain/health` returns `"status":"ok"`
- [ ] You can register a real staff account against the production API
- [ ] Startup logs show the integration status you expect (check
      whichever of Twilio/Postmark/Stripe/AWS you configured actually
      say `[OK]`, not `[NOT CONFIGURED]`)
- [ ] The daily backup Cron Job is set up and has run at least once
      successfully
- [ ] Your domain resolves and shows a valid TLS certificate (the
      padlock in your browser)
- [ ] `.env` was never committed to git (`git log --all --full-history -- backend/.env` should show nothing)

---

## Troubleshooting

**`docker compose up` fails immediately.** Docker Desktop probably isn't
actually running — check for its icon in your system tray/menu bar.

**Health check returns `"database":"unreachable"`.** Usually means the
Postgres container is still starting up (wait 10-20 seconds and retry)
or your `DATABASE_URL` has a typo. Run `docker compose logs postgres` to
see its own startup logs.

**Railway build fails.** Click into the failed deployment's logs — this
is the exact same `Dockerfile` from local testing, so a build failure
here almost always means something environment-specific (a missing
variable Railway needs that your local `.env` had). Compare against
`backend/.env.example` for anything missing.

**"Invalid Stripe signature" or similar integration errors in logs.**
Expected and harmless if you haven't set that integration up yet — see
the startup Integration status log to confirm what's actually configured
versus what's just attempting to run anyway from stale test data.
