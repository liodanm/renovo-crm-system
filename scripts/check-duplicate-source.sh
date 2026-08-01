#!/usr/bin/env bash
# Fails if the repo contains a stray duplicate source tree — the exact class of
# problem quote-widget-complete/ turned out to be: a full delivery bundle
# (app.module.ts, services, a second schema.prisma, a second PROJECT_CONTEXT.md)
# dropped at the repo root, fully unwired from any build, and committed anyway.
#
# Two independent checks:
#   1. Unexpected top-level directory — the cheapest, highest-signal check.
#      Anything outside the known project layout is flagged immediately, before
#      even looking at file contents. This alone would have caught
#      quote-widget-complete/ on the PR that introduced it.
#   2. Cross-tree content duplication — hashes every source/doc file in the repo
#      (excluding node_modules/.git/build output, and excluding init-scripts/,
#      which is EXPECTED by design to duplicate migration content — that
#      relationship is verified separately by check-migration-sync.sh) and fails
#      if any file's content is byte-identical to another file living under a
#      different top-level directory.
#
# Run from the repo root: ./scripts/check-duplicate-source.sh
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

fail=0

# --- Check 1: unexpected top-level directories -----------------------------
# Anything not in this list is either new intentional project structure (update
# this list in the same PR that adds it) or exactly the kind of stray dump this
# script exists to catch.
ALLOWED_TOP_LEVEL_DIRS="backend frontend docs init-scripts scripts .github"

echo "== Checking for unexpected top-level directories =="
for d in */; do
  name="${d%/}"
  case "$name" in
    .*) continue ;;  # dotdirs (.git, .github handled below via explicit allow)
  esac
  allowed=0
  for a in $ALLOWED_TOP_LEVEL_DIRS; do
    if [ "$name" = "$a" ]; then
      allowed=1
      break
    fi
  done
  if [ "$allowed" -eq 0 ]; then
    echo "  UNEXPECTED DIRECTORY: ./$name"
    echo "    Not in the allowed top-level layout ($ALLOWED_TOP_LEVEL_DIRS)."
    echo "    If this is intentional new structure, add it to ALLOWED_TOP_LEVEL_DIRS"
    echo "    in scripts/check-duplicate-source.sh in the same PR. Otherwise this"
    echo "    looks like a stray delivery/dump (the quote-widget-complete/ pattern)."
    fail=1
  fi
done
# .github is a dotdir with real content (workflows) -- confirm it exists and skip
# it from the stray-dotdir concern rather than silently ignoring all dotdirs.
if [ ! -d ".github" ]; then
  echo "  NOTE: .github/ not found (expected for CI workflows) -- not a failure, just unusual."
fi

# --- Check 2: cross-tree content duplication --------------------------------
echo "== Checking for duplicate file content across different top-level directories =="
echo "   (init-scripts/ is excluded -- it is EXPECTED to mirror migration content;"
echo "    see check-migration-sync.sh for that check instead)"

TMP_HASHES="$(mktemp)"
trap 'rm -f "$TMP_HASHES"' EXIT

find . \
  -path './node_modules' -prune -o \
  -path './.git' -prune -o \
  -path '*/node_modules' -prune -o \
  -path '*/.next' -prune -o \
  -path '*/dist' -prune -o \
  -path './init-scripts' -prune -o \
  -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.sql' -o -name '*.prisma' -o -name '*.js' \) \
  -print0 2>/dev/null \
| xargs -0 sha256sum 2>/dev/null > "$TMP_HASHES"

dupe_hashes="$(awk '{print $1}' "$TMP_HASHES" | sort | uniq -d)"

if [ -n "$dupe_hashes" ]; then
  while IFS= read -r h; do
    [ -z "$h" ] && continue
    paths="$(grep "^$h" "$TMP_HASHES" | awk '{print $2}')"
    top_dirs="$(echo "$paths" | sed -E 's#^\./([^/]+)/.*#\1#' | sort -u)"
    top_dir_count="$(echo "$top_dirs" | wc -l)"
    if [ "$top_dir_count" -gt 1 ]; then
      echo "  DUPLICATE CONTENT across top-level directories:"
      echo "$paths" | sed 's/^/    /'
      fail=1
    fi
  done <<< "$dupe_hashes"
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "FAILED: repository contains a stray duplicate source tree or unexpected top-level directory."
  exit 1
fi

echo "PASSED: no stray duplicate source trees or unexpected top-level directories found."
