#!/usr/bin/env bash
#
# Daily Postgres backup, run via OS-level cron — deliberately NOT part of
# the NestJS application, so a backup still happens even if the app itself
# is down, crashed, or mid-deploy. Add to crontab with:
#   0 3 * * * /path/to/backend/scripts/backup-database.sh >> /var/log/renovo-backup.log 2>&1
#
# Requires: pg_dump (from the postgresql-client package), the AWS CLI,
# and DATABASE_URL + AWS_S3_BUCKET set in the environment (source your
# .env before running, or set these in the crontab entry itself).

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Aborting backup." >&2
  exit 1
fi
if [ -z "${AWS_S3_BUCKET:-}" ]; then
  echo "ERROR: AWS_S3_BUCKET is not set. Aborting backup." >&2
  exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
BACKUP_FILE="/tmp/renovo-crm-${TIMESTAMP}.dump"
S3_KEY="backups/renovo-crm-${TIMESTAMP}.dump"

echo "[$(date -u)] Starting backup..."

# --format=custom: Postgres's own recommended format for this exact use
# case — built-in compression, supports selective/partial restore, and
# it's what pg_restore expects on the way back in.
pg_dump "$DATABASE_URL" --format=custom --file="$BACKUP_FILE"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date -u)] pg_dump complete: ${BACKUP_FILE} (${BACKUP_SIZE})"

aws s3 cp "$BACKUP_FILE" "s3://${AWS_S3_BUCKET}/${S3_KEY}" --only-show-errors

echo "[$(date -u)] Uploaded to s3://${AWS_S3_BUCKET}/${S3_KEY}"

# Clean up the local temp file — the S3 copy is the durable one, and this
# runs on the same disk as the app, which shouldn't accumulate backup files.
rm -f "$BACKUP_FILE"

echo "[$(date -u)] Backup complete."
