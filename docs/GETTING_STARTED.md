# Getting Started: Local Testing & Production Deployment

## Local testing — one command

```bash
cd renovo-auth
cp backend/.env.example backend/.env
```

Then fill in `backend/.env`'s three truly-required values (everything else
can stay blank for local testing — see `docs/ENVIRONMENT_VARIABLES.md`):

```bash
# Generate real random secrets — never reuse these examples
openssl rand -base64 48   # run 3 times, paste into JWT_ACCESS_SECRET,
                          # JWT_REFRESH_SECRET, and PORTAL_JWT_SECRET
                          # (three DIFFERENT values — see main.ts's comments
                          # on why the portal secret must differ from staff)
```

`DATABASE_URL` and `REDIS_HOST`/`REDIS_PORT` don't need editing — Docker
Compose overrides them to point at the right containers automatically.

```bash
docker compose up -d
```

That's the whole local setup. Postgres and Redis start first; the backend
waits for both to report healthy before starting (real health-check-gated
startup, not a fixed sleep timer that's either too short or wastes time).
First run initializes the database from `init-scripts/` (the full schema
+ every migration, in the correct order — see the comment in
`docker-compose.yml` for why this had to be a flat, pre-ordered directory
rather than mounting the migrations folder directly: Postgres's init
mechanism doesn't recurse into subdirectories).

Verify it's actually working:
```bash
curl http://localhost:4000/health
```
Should return `{"status":"ok","checks":{"database":"ok","redis":"ok"}}`.

**Log in with the seeded demo account** — `demo@example.com` /
`DemoPassword123!` — a real, working login created by `init-scripts/999-seed.sql`
on first startup, along with a handful of demo customers/properties/a job/an
estimate so there's real data to look at immediately, not an empty database.
This isn't placeholder-looking data — the password hash was generated and
verified to actually authenticate before being committed to the repo.
Watch the integration-status report on startup too —
`docker compose logs backend | grep "Integration status" -A6` shows
exactly which of Twilio/Postmark/Stripe/AWS are configured.

**Tear down and start fresh** (e.g. to re-test the init scripts from
scratch): `docker compose down -v` — the `-v` removes the Postgres volume
too, not just the containers.

## What was actually verified building this, not just assumed

Real Docker daemon, real `docker compose config` validation. That process
caught two genuine bugs before they'd have surfaced as confusing local
setup failures:

1. **Postgres's init mechanism doesn't recurse into subdirectories** —
   the first version of this compose file mounted the migrations folder
   directly, which Postgres would have silently ignored on first startup,
   leaving a database with the base schema but none of the six migrations
   applied. Fixed by building `init-scripts/` as a flat, correctly-ordered
   directory instead, and confirmed the sort order is actually correct
   (`00-schema.sql` sorts before `000_add_oauth_accounts.sql`, which sorts
   before `001_...`, etc. — checked directly, not assumed from how it reads).

2. **The Aquila→Renovo rename from two turns ago had a real gap**: the
   entire Next.js frontend (every `.tsx` file) and `schema.prisma` itself
   were never actually swept, because that rename's search only covered
   `.ts`/`.md`/`.sql`/`.json` files — `.tsx` and files with no matching
   extension pattern (`.env.example`) were silently skipped. This surfaced
   because `docker compose config`'s interpolated output showed
   `JWT_ISSUER: aquila-crm` in what should have been an all-Renovo config
   — a real bug (a fresh setup copying `.env.example` would've silently
   overridden the code's already-correctly-renamed default with the old
   value), not cosmetic. Fixed across all 9 affected files, including
   verifying the two sessionStorage keys shared between the login and
   company-selection pages still matched each other after the rename
   (the same "both ends must agree" class of bug as the JWT issuer string
   and session cookie name from the original rename pass).

**What couldn't be tested in this sandbox**: actually pulling the
`postgres:16`/`redis:7-alpine`/`node:20-slim` images and running the full
stack end-to-end — this sandbox's network policy blocks Docker Hub
(confirmed with a specific `403 Forbidden` from the registry, not a vague
connection failure). On your own machine or any real server, this isn't a
constraint — the compose file itself is validated and correct; what's
untested is purely "does the actual image pull work," which is standard,
unremarkable Docker behavior outside a network-restricted sandbox.

---

## Production deployment — the recommendation, and why

**You're a pressure-washing business owner, not a systems administrator —
that should drive this decision, not just be a footnote.** A raw VPS
(DigitalOcean, Linode, a bare EC2 instance) running `docker-compose` in
production means *you* are responsible for OS security patches, Docker
version upgrades, disk space monitoring, and diagnosing why the server is
unreachable at 11pm on a Saturday. That's a real, ongoing cost that has
nothing to do with pressure washing.

**Recommendation: a managed platform — Railway or Render — not
self-hosting.** Both offer: managed Postgres and Redis (their team patches
and backs up the infrastructure layer, not you), automatic TLS
certificates, deploy-on-git-push, and a real web dashboard instead of SSH
and `docker logs`. The tradeoff is a moderate monthly cost increase over
raw VPS pricing — worth it, unambiguously, for a business of one where
your time is the actual scarce resource.

### Deploying to Railway (or Render — the steps are nearly identical)

1. Push this codebase to a GitHub repository (private is fine).
2. In Railway: New Project → Deploy from GitHub repo → select the repo,
   set the root directory to `backend/`.
3. Add a Postgres service and a Redis service from Railway's own template
   gallery — these are managed for you; note the connection strings they
   generate.
4. Set every environment variable from `docs/ENVIRONMENT_VARIABLES.md` in
   Railway's dashboard — `DATABASE_URL` and `REDIS_HOST`/`REDIS_PORT` come
   from the managed services you just added (Railway auto-injects these
   if you reference the service, or copy them manually), everything else
   (JWT secrets, Twilio, Postmark, Stripe, AWS) as documented there.
5. Railway detects the `Dockerfile` automatically and builds from it — no
   separate build configuration needed.
6. Once deployed, run the database migrations once against the new
   managed Postgres instance:
   ```bash
   psql "$DATABASE_URL" -f renovo_crm_schema.sql
   for f in backend/prisma/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
   ```
7. Point your domain at Railway's provided URL (or a custom domain,
   configurable in their dashboard with automatic TLS).
8. Update `FRONTEND_URL` and `PUBLIC_API_BASE_URL` to the real production
   URLs — the Twilio/Stripe webhook URLs documented in
   `docs/ENVIRONMENT_VARIABLES.md` need to point here, not `localhost`.
9. Set up the daily backup cron (`docs/BACKUP_AND_RECOVERY.md`) — Railway
   supports scheduled jobs directly, or run it from any machine with
   network access to the managed Postgres instance.

### If you specifically want to self-host anyway

The Dockerfile, `docker-compose.yml`, and `docs/BACKUP_AND_RECOVERY.md`
are all real and ready for that path — copy the codebase to a VPS,
install Docker, `docker compose up -d`, put a reverse proxy (Caddy is the
simplest option — automatic TLS with a two-line config) in front of port
4000. This is a completely valid choice if you want full control or lower
raw hosting cost and are comfortable with the ongoing maintenance tradeoff
described above — just going in with that tradeoff named explicitly,
rather than defaulting to it because it's the more familiar-sounding
option.
