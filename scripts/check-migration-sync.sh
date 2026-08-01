#!/usr/bin/env bash
# Fails if init-scripts/ (the flat directory Postgres's docker-entrypoint-initdb.d
# reads on first container start) has drifted from the real migration history in
# backend/prisma/migrations/. This exact drift shipped silently for a long time —
# init-scripts/ was built once, when the project had 6 migrations, and never
# updated as it grew to 28. This script exists so that can't happen again without
# CI catching it on the very next PR.
#
# Checks, in order:
#   1. Every file in backend/prisma/migrations/ has a byte-identical twin in
#      init-scripts/ with the same name.
#   2. init-scripts/ contains no *numbered* migration file that doesn't exist in
#      backend/prisma/migrations/ (an orphan/stale migration).
#   3. init-scripts/00-schema.sql is byte-identical to renovo_crm_schema.sql.
#   4. backend/prisma/seed.sql has a byte-identical twin somewhere in init-scripts/,
#      and that twin's filename sorts AFTER every migration filename (so Postgres
#      applies it last, against the complete schema — not interleaved).
#
# Run from the repo root: ./scripts/check-migration-sync.sh
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MIGRATIONS_DIR="backend/prisma/migrations"
INIT_DIR="init-scripts"
SCHEMA_FILE="renovo_crm_schema.sql"
SEED_FILE="backend/prisma/seed.sql"

fail=0

echo "== Checking every migration in $MIGRATIONS_DIR has an identical twin in $INIT_DIR =="
for f in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$f")"
  twin="$INIT_DIR/$name"
  if [ ! -f "$twin" ]; then
    echo "  MISSING: $twin does not exist (migration '$name' is not mirrored)"
    fail=1
    continue
  fi
  h1="$(sha256sum "$f" | awk '{print $1}')"
  h2="$(sha256sum "$twin" | awk '{print $1}')"
  if [ "$h1" != "$h2" ]; then
    echo "  MISMATCH: $twin differs from $f (content drift, not just missing)"
    fail=1
  fi
done

echo "== Checking for orphan numbered migrations in $INIT_DIR (present there but not in $MIGRATIONS_DIR) =="
for f in "$INIT_DIR"/*.sql; do
  name="$(basename "$f")"
  case "$name" in
    [0-9][0-9][0-9]_*.sql)
      if [ ! -f "$MIGRATIONS_DIR/$name" ]; then
        echo "  ORPHAN: $f has no corresponding file in $MIGRATIONS_DIR"
        fail=1
      fi
      ;;
  esac
done

echo "== Checking $INIT_DIR/00-schema.sql matches $SCHEMA_FILE =="
if [ ! -f "$INIT_DIR/00-schema.sql" ]; then
  echo "  MISSING: $INIT_DIR/00-schema.sql does not exist"
  fail=1
elif [ ! -f "$SCHEMA_FILE" ]; then
  echo "  MISSING: $SCHEMA_FILE does not exist"
  fail=1
else
  h1="$(sha256sum "$SCHEMA_FILE" | awk '{print $1}')"
  h2="$(sha256sum "$INIT_DIR/00-schema.sql" | awk '{print $1}')"
  if [ "$h1" != "$h2" ]; then
    echo "  MISMATCH: $INIT_DIR/00-schema.sql differs from $SCHEMA_FILE"
    fail=1
  fi
fi

echo "== Checking a seed file matching $SEED_FILE exists in $INIT_DIR and sorts after all migrations =="
if [ ! -f "$SEED_FILE" ]; then
  echo "  MISSING: $SEED_FILE does not exist"
  fail=1
else
  seed_hash="$(sha256sum "$SEED_FILE" | awk '{print $1}')"
  seed_twin=""
  for f in "$INIT_DIR"/*.sql; do
    h="$(sha256sum "$f" | awk '{print $1}')"
    if [ "$h" = "$seed_hash" ]; then
      seed_twin="$f"
      break
    fi
  done
  if [ -z "$seed_twin" ]; then
    echo "  MISSING: no file in $INIT_DIR matches the content of $SEED_FILE"
    fail=1
  else
    last_migration="$(ls "$MIGRATIONS_DIR"/*.sql | xargs -n1 basename | sort | tail -1)"
    seed_name="$(basename "$seed_twin")"
    ordered_last="$(printf '%s\n%s\n' "$last_migration" "$seed_name" | sort | tail -1)"
    if [ "$ordered_last" != "$seed_name" ]; then
      echo "  ORDER: $seed_name sorts BEFORE $last_migration -- seed data would run before the schema is fully migrated"
      fail=1
    else
      echo "  OK: seed file ($seed_name) sorts after the last migration ($last_migration)"
    fi
  fi
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "FAILED: init-scripts/ has drifted from backend/prisma/migrations/. Regenerate it (see docs/GETTING_STARTED.md) before merging."
  exit 1
fi

echo "PASSED: init-scripts/ is in sync with backend/prisma/migrations/, $SCHEMA_FILE, and $SEED_FILE."
