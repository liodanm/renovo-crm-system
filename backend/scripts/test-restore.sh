#!/usr/bin/env bash
#
# Restore-testing procedure — pulls the most recent backup from S3 and
# restores it into a SEPARATE, disposable database. This never touches
# production data, which is exactly why it's safe to run this anytime
# (weekly, is the recommendation in docs/BACKUP_AND_RECOVERY.md) to prove
# backups are actually restorable — a backup nobody has ever restored is
# an assumption, not a guarantee.
#
# Usage: ./scripts/test-restore.sh
# Requires the same env vars as backup-database.sh, plus a Postgres
# instance reachable at the same host as DATABASE_URL (this script derives
# the scratch database's connection details from DATABASE_URL directly).

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ] || [ -z "${AWS_S3_BUCKET:-}" ]; then
  echo "ERROR: DATABASE_URL and AWS_S3_BUCKET must be set." >&2
  exit 1
fi

SCRATCH_DB_NAME="renovo_restore_test"
TEMP_DUMP="/tmp/renovo-restore-test.dump"

echo "[$(date -u)] Finding the most recent backup in S3..."
LATEST_KEY=$(aws s3api list-objects-v2 \
  --bucket "$AWS_S3_BUCKET" \
  --prefix "backups/" \
  --query 'sort_by(Contents, &LastModified)[-1].Key' \
  --output text)

if [ -z "$LATEST_KEY" ] || [ "$LATEST_KEY" == "None" ]; then
  echo "ERROR: No backups found in s3://${AWS_S3_BUCKET}/backups/ — nothing to test." >&2
  exit 1
fi

echo "[$(date -u)] Downloading ${LATEST_KEY}..."
aws s3 cp "s3://${AWS_S3_BUCKET}/${LATEST_KEY}" "$TEMP_DUMP" --only-show-errors

# Derive connection details from DATABASE_URL to build a scratch-database
# connection string that points at the SAME server but a DIFFERENT,
# disposable database — never the real one.
BASE_CONNECTION=$(echo "$DATABASE_URL" | sed -E 's#(/[^/?]+)(\?.*)?$##')

echo "[$(date -u)] Recreating scratch database '${SCRATCH_DB_NAME}'..."
psql "${BASE_CONNECTION}/postgres" -c "DROP DATABASE IF EXISTS ${SCRATCH_DB_NAME};"
psql "${BASE_CONNECTION}/postgres" -c "CREATE DATABASE ${SCRATCH_DB_NAME};"

echo "[$(date -u)] Restoring backup into scratch database..."
pg_restore --dbname="${BASE_CONNECTION}/${SCRATCH_DB_NAME}" --no-owner --no-privileges "$TEMP_DUMP"

echo "[$(date -u)] Verifying restored data with a real query..."
CUSTOMER_COUNT=$(psql "${BASE_CONNECTION}/${SCRATCH_DB_NAME}" -t -c "SELECT count(*) FROM customers;" | xargs)
echo "[$(date -u)] Restored database contains ${CUSTOMER_COUNT} customer row(s)."

if [ "$CUSTOMER_COUNT" -gt 0 ]; then
  echo "[$(date -u)] RESTORE TEST PASSED — backup is valid and restorable."
else
  echo "[$(date -u)] WARNING: Restore succeeded but the customers table is empty. Investigate before trusting this backup." >&2
fi

# Clean up — the scratch database and local file were only ever for
# verification, not meant to persist.
psql "${BASE_CONNECTION}/postgres" -c "DROP DATABASE IF EXISTS ${SCRATCH_DB_NAME};"
rm -f "$TEMP_DUMP"

echo "[$(date -u)] Restore test complete."
