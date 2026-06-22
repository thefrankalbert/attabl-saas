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
#   4. production additionally requires an explicit typed confirmation AND
#      takes a schema backup to supabase/backups/ first (refuses if backup fails)
#
# Usage:
#   scripts/db-migrate.sh --target staging                 # apply pending -> staging
#   scripts/db-migrate.sh --target staging --dry-run        # just show the diff
#   scripts/db-migrate.sh --target production --confirm      # backup + apply -> prod
#
# Env file per target:  .env.staging  ->  staging   |  .env.local -> local/production
# DATABASE_URL (session pooler) must be set in the chosen env file.
#
set -euo pipefail

TARGET=""
DRY_RUN=0
CONFIRM=0

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --confirm) CONFIRM=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "ERROR: --target is required (staging | production | local)" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Resolve the env file for the target. Production deliberately reuses .env.local
# only because there is no separate prod env file yet; once a staging project
# exists, set up .env.staging (see .env.staging.example) and CI handles prod.
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

if [ "$TARGET" = "production" ]; then
  if [ "$CONFIRM" != "1" ]; then
    echo "REFUSING: production requires --confirm." >&2
    exit 3
  fi
  # Mandatory pre-apply schema backup. No backup -> no apply.
  # Prefer a direct pg_dump (no Docker dependency); fall back to supabase db dump.
  mkdir -p supabase/backups
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  BACKUP="supabase/backups/prod-schema-${STAMP}.sql"
  echo "=== Backing up production schema -> $BACKUP ==="
  # Try a direct pg_dump first (fast, no Docker). pg_dump refuses on a major-version
  # mismatch, so fall back to the version-matched dockerized supabase db dump.
  _backed_up=0
  if command -v pg_dump >/dev/null 2>&1; then
    if pg_dump --schema-only --no-owner --no-privileges -d "$DATABASE_URL" -f "$BACKUP" 2>/dev/null; then
      _backed_up=1
    else
      echo "pg_dump unavailable for this server version - falling back to supabase db dump..."
    fi
  fi
  if [ "$_backed_up" = "0" ]; then
    if ! supabase db dump --db-url "$DATABASE_URL" -f "$BACKUP"; then
      echo "ERROR: schema backup failed (pg_dump + supabase db dump both failed) - aborting." >&2
      exit 4
    fi
  fi
  if [ ! -s "$BACKUP" ]; then
    echo "ERROR: backup file is empty - aborting before any change." >&2
    exit 4
  fi
  echo "Backup written: $BACKUP ($(wc -l < "$BACKUP" | tr -d ' ') lines)"
  echo
fi

echo "=== Applying pending migrations -> $TARGET ==="
supabase db push --db-url "$DATABASE_URL"
echo

echo "=== Post-apply migration state ==="
supabase migration list --db-url "$DATABASE_URL"
echo "Done."
