#!/bin/sh
# Railway Pre-Deploy Command — runs once, between build and deploy,
# before the new app instance starts serving traffic. If this exits
# non-zero, Railway blocks the deploy entirely rather than shipping
# code that expects columns/tables the live database doesn't have yet
# — the exact failure mode behind every migration-related outage this
# project has hit so far.
#
# Tracks applied migrations in a real table (schema_migrations) rather
# than blindly re-running every .sql file on every deploy — not every
# existing migration in this project is guaranteed idempotent (some
# predate the IF NOT EXISTS convention), so re-running an already-applied
# one could error instead of being a safe no-op.
set -e

echo "Running database migrations..."

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
"

for filepath in backend/prisma/migrations/*.sql; do
  filename=$(basename "$filepath")
  already_applied=$(psql "$DATABASE_URL" -t -A -c "SELECT 1 FROM schema_migrations WHERE filename = '$filename';")

  if [ "$already_applied" = "1" ]; then
    echo "  skip  $filename (already applied)"
  else
    echo "  apply $filename"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$filepath"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migrations (filename) VALUES ('$filename');"
  fi
done

echo "Migrations complete."
