#!/usr/bin/env bash
#
# Safe Supabase migration runner - never apply to production blind.
#
# The plain `supabase db push` (pnpm db:migrate) pushes to whatever DATABASE_URL
# is in .env.local. On a single-project setup that is PRODUCTION, with no dry-run,
# no backup, and no diff - one fat-fingered policy change can take down live
# anonymous ordering. This wrapper enforces the professional workflow:
#
#   1. target is explicit (staging | production | local)            - no ambient default
#   2. it ALWAYS prints the pending-migration diff before doing anything
#   3. --dry-run stops there (the default-safe inspection mode)
#   4. production is READ-ONLY here (--dry-run only). `supabase db push` is
#      refused on production: its migration history table is out of sync with
#      the files (47 versions without a file, about 40 files without a row,
#      measured 2026-11-07), so a push would re-apply or skip migrations
#      blindly. Production migrations are applied one by one with psql, after
#      a backup, and checked by existence in the database.
#   5. `local` only accepts a database on this machine (127.0.0.1 / localhost):
#      .env.local points at PRODUCTION.
#
# Usage:
#   scripts/db-migrate.sh --target staging                 # apply pending -> staging
#   scripts/db-migrate.sh --target staging --dry-run        # just show the diff
#   scripts/db-migrate.sh --target production --dry-run     # read-only: what is pending
#
# Env file per target:  .env.staging  ->  staging   |  .env.local -> local/production
# DATABASE_URL (session pooler) must be set in the chosen env file.
#
set -euo pipefail

TARGET=""
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "ERROR: --target is required (staging | production | local)" >&2
  exit 2
fi

if [ "$TARGET" = "production" ] && [ "$DRY_RUN" != "1" ]; then
  echo "REFUSING: no 'supabase db push' on production (history out of sync, see the" >&2
  echo "header of this script). Apply the migration with psql after a backup." >&2
  exit 3
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Resolve the env file for the target. Production (read-only here) and local
# both read .env.local, which points at production: hence the host check below.
case "$TARGET" in
  staging)     ENV_FILE=".env.staging" ;;
  production)  ENV_FILE=".env.local" ;;
  local)       ENV_FILE=".env.local" ;;
  *) echo "ERROR: --target must be staging | production | local" >&2; exit 2 ;;
esac

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: env file $ENV_FILE not found for target '$TARGET'." >&2
  [ "$TARGET" = "staging" ] && echo "Create it from .env.staging.example and point it at your staging Supabase project." >&2
  exit 2
fi

# Load DATABASE_URL from the target env file only (do not leak it to stdout).
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not set in $ENV_FILE (need the session-pooler connection string)." >&2
  exit 2
fi

# Mask the host for the operator without printing credentials.
HOST_MASK="$(printf '%s' "$DATABASE_URL" | sed -E 's#.*@([^:/]+).*#\1#')"
if [ "$TARGET" = "local" ] && ! printf '%s' "$HOST_MASK" | grep -Eq '^(127\.0\.0\.1|localhost)$'; then
  echo "REFUSING: target 'local' but DATABASE_URL points at $HOST_MASK, not this machine." >&2
  exit 3
fi

echo "Target:    $TARGET"
echo "Env file:  $ENV_FILE"
echo "DB host:   $HOST_MASK"
echo

echo "=== Pending migrations (local not yet on remote) ==="
supabase migration list --db-url "$DATABASE_URL"
echo

if [ "$DRY_RUN" = "1" ]; then
  echo "Dry run - nothing applied. Re-run without --dry-run to apply."
  exit 0
fi

echo "=== Applying pending migrations -> $TARGET ==="
supabase db push --db-url "$DATABASE_URL"
echo

echo "=== Post-apply migration state ==="
supabase migration list --db-url "$DATABASE_URL"
echo "Done."
