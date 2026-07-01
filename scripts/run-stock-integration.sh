#!/usr/bin/env bash
#
# Run the stock-engine INTEGRATION tests against a fully LOCAL Supabase stack.
#
# Why this exists: the unit suite mocks supabase.rpc, so the inventory SQL
# (destock_order, restock_order, set_opening_stock, get_stock_status) is never
# executed. This suite calls the real RPCs against a local Postgres and asserts
# the resulting rows - the only way to catch a silent SQL regression (audit
# risk #1). Not part of the 5 CI gates: needs Docker + the prod schema snapshot.
#
# Bootstrap mirrors scripts/run-journeys-local.sh (same reason: repo migrations
# do NOT rebuild a virgin DB - the initial schema was set in prod before tracking
# - so we load a schema snapshot then replay only the post-marker deltas). Unlike
# the journeys runner, this needs NO dev server: the tests talk to Postgres/
# PostgREST directly via the service_role client.
#
# Everything is LOCAL: no prod writes, known local service_role key.
# Usage:   bash scripts/run-stock-integration.sh   (or: pnpm test:db)
# Prereqs: Docker running, supabase CLI, pnpm install done.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

FIXTURE_MARKER="20260628000000"
SCHEMA_FIXTURE="tests/journeys/fixtures/schema.sql"
LOCAL_DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
MIG_BAK="$(mktemp -d)"

log() { echo "[stock-it] $*"; }

cleanup() {
  log "teardown..."
  supabase stop --no-backup >/dev/null 2>&1 || true
  # Restore tracked migration files (interrupt-safe) + any untracked ones parked in MIG_BAK.
  git checkout -- supabase/migrations/ 2>/dev/null || true
  if [ -d "$MIG_BAK" ] && [ -n "$(ls -A "$MIG_BAK" 2>/dev/null)" ]; then
    mv -n "$MIG_BAK"/*.sql supabase/migrations/ 2>/dev/null || true
  fi
  rm -rf "$MIG_BAK" supabase/config.toml supabase/.gitignore supabase/.branches supabase/.temp 2>/dev/null || true
  log "teardown done."
}
trap cleanup EXIT

command -v supabase >/dev/null || { echo "supabase CLI absent"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker non lance"; exit 1; }
[ -f "$SCHEMA_FIXTURE" ] || { echo "fixture absente: $SCHEMA_FIXTURE"; exit 1; }

log "init + ecarte les migrations repo (sinon supabase start rejoue la chaine cassee)"
supabase init >/dev/null 2>&1 || true
mv supabase/migrations/*.sql "$MIG_BAK"/ 2>/dev/null || true

log "supabase start (stack local vierge, sans edge-runtime)"
# Exclude edge-runtime: it boots by fetching Deno std deps over the network
# (https://deno.land/...) and hangs `supabase start` when external DNS is blocked.
# These tests only need Postgres + PostgREST + GoTrue (auth), never edge functions.
supabase start -x edge-runtime >/dev/null 2>&1 || { echo "supabase start a echoue"; exit 1; }

log "charge le schema prod (snapshot) dans le local"
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -q -f "$SCHEMA_FIXTURE" >/dev/null || { echo "load schema echoue"; exit 1; }

log "applique les deltas de migration > $FIXTURE_MARKER"
for f in "$MIG_BAK"/*.sql; do
  ts="$(basename "$f" | cut -d_ -f1)"
  if [[ "$ts" > "$FIXTURE_MARKER" ]]; then
    log "  delta: $(basename "$f")"
    psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null || { echo "delta $f echoue"; exit 1; }
  fi
done
psql "$LOCAL_DB" -c "NOTIFY pgrst, 'reload schema';" >/dev/null 2>&1 || true

# Local keys (format sb_publishable_/sb_secret_, accepted by supabase-js)
eval "$(supabase status -o env 2>/dev/null | sed 's/^/export SB_/')"
API_URL="${SB_API_URL:-http://127.0.0.1:54321}"
SERVICE="${SB_SERVICE_ROLE_KEY:?cle service_role introuvable}"
ANON="${SB_ANON_KEY:-}"

log "vitest integration (real RPC assertions)"
JOURNEY_SUPABASE_URL="$API_URL" \
  JOURNEY_SUPABASE_SERVICE_ROLE_KEY="$SERVICE" \
  JOURNEY_SUPABASE_ANON_KEY="$ANON" \
  npx vitest run --config vitest.integration.config.ts
RUN_EXIT=$?

log "resultat vitest: exit $RUN_EXIT"
exit $RUN_EXIT
