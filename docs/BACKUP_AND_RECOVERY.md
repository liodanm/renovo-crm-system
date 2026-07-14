# Backup & Recovery — Renovo CRM

## What's in place

- **`scripts/backup-database.sh`** — runs `pg_dump` and uploads to S3 under
  `backups/`. Runs via OS-level cron, independent of the application
  process (see the script header for why that separation matters).
- **`scripts/test-restore.sh`** — restores the most recent backup into a
  disposable scratch database and verifies real data came back correctly.
  Never touches production. Safe to run anytime.
- **S3 Lifecycle Policy** (configured on the bucket, not in code — see
  setup below) — automatically deletes backups older than 30 days.

## Setup (one-time)

1. **Cron.** On the server running the backend, add to crontab
   (`crontab -e`):
   ```
   0 3 * * * cd /path/to/backend && set -a && source .env && set +a && ./scripts/backup-database.sh >> /var/log/renovo-backup.log 2>&1
   ```
   Runs daily at 3am server time — outside business hours, so it never
   competes with the app for database resources during the day.

2. **S3 Lifecycle Policy.** In the AWS Console: S3 → your bucket →
   Management → Create lifecycle rule → scope to prefix `backups/` →
   "Expire current versions of objects" after 30 days. This is what
   enforces the retention policy — deliberately not custom code, since a
   native AWS feature has no bug of its own to introduce.

3. **IAM permissions.** The AWS credentials used for backups need
   `s3:PutObject`, `s3:GetObject`, and `s3:ListBucket` on the backup
   bucket — the same IAM user already created for photo storage (see
   `docs/ENVIRONMENT_VARIABLES.md`) covers this if scoped to the whole
   bucket.

## Retention policy

- **Daily backups, kept 30 days.** At solo-operator data volumes, 30 days
  of history is enough to recover from almost any realistic mistake
  (accidental deletion, a bad migration, data corruption) without
  indefinitely accumulating storage cost.
- If this ever needs longer retention (e.g. for a specific compliance
  reason), extend the lifecycle rule — no code change required.

## Restore procedure — recovering from data loss

**If this is an active emergency (production database is actually gone or
corrupted), do this, not the test script:**

1. Provision a fresh Postgres instance (or use the existing one if it's
   just the data that's damaged, not the server).
2. Find the backup to restore:
   ```
   aws s3api list-objects-v2 --bucket <bucket> --prefix backups/ --query 'sort_by(Contents,&LastModified)[-1].Key'
   ```
3. Download it: `aws s3 cp s3://<bucket>/<key> ./recovery.dump`
4. Restore directly into the real target database:
   ```
   pg_restore --dbname="$DATABASE_URL" --no-owner --no-privileges --clean --if-exists ./recovery.dump
   ```
   `--clean --if-exists` drops existing objects before recreating them —
   appropriate for a genuine recovery where the target is being replaced,
   NOT for the routine test-restore script, which restores into an empty
   scratch database instead.
5. Verify: `psql "$DATABASE_URL" -c "SELECT count(*) FROM customers;"` —
   confirm the count looks right before considering the app back online.
6. Restart the application.

**Data loss window:** backups run once daily, so a worst-case incident
loses up to ~24 hours of the most recent changes (anything created or
modified since the last backup). This is the real, honest tradeoff of
daily-frequency backups — acceptable at solo-operator transaction volume,
worth knowing explicitly rather than assuming "we have backups" means
"we can't lose anything."

## Testing this actually works

Run `./scripts/test-restore.sh` — recommended weekly, or after any schema
migration. It pulls the real latest backup, restores it into a disposable
database, and verifies real data (not just that the restore command
exited without error) came back correctly. **A backup that has never been
restored is an assumption, not a guarantee** — this is what turns that
assumption into a verified fact, repeatedly, without any risk to
production data.

## What was actually verified, not just written

Before this was documented as "working," the underlying `pg_dump` →
`pg_restore` mechanism was tested against a live database with real
seeded data: dumped, restored into a genuinely separate scratch database,
and cross-checked — row counts matched exactly across three different
tables, a specific customer's data (name, email) came back byte-for-byte
identical, and critically, **the Row-Level Security policy itself
survived the restore intact** (both the `ENABLE ROW LEVEL SECURITY` flag
and the actual policy definition, checked separately — the first without
the second would silently leave a restored database without its
tenant-isolation security layer, which is exactly the kind of gap that's
easy to miss and serious if missed).

What wasn't testable in this environment: the actual S3 upload/download
legs, since that requires real AWS credentials this sandbox doesn't have.
The core mechanism that actually protects your data — can a backup be
made and correctly restored — was verified for real.
