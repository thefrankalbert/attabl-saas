#!/usr/bin/env bash
#
# Run the "journee complete" harness against a fully LOCAL Supabase stack.
#
# Pourquoi ce script: les migrations du repo ne reconstruisent pas une base
# vierge (pas de CREATE TABLE de base - le schema initial a ete etabli en prod
# avant le tracking). On contourne en chargeant un snapshot du schema prod
# (tests/journeys/fixtures/schema.sql) puis en appliquant uniquement les
# migrations PLUS RECENTES que ce snapshot (les deltas de branche encore non
# deployes en prod, ex: la cle d'idempotence des commandes).
#
# Tout est LOCAL: aucune ecriture sur la prod, cle service_role locale connue.
# Usage:
#   bash scripts/run-journeys-local.sh                  # tous les parcours
#   bash scripts/run-journeys-local.sh 04-service       # un parcours (grep nom)
#
# Pre-requis: Docker lance, supabase CLI, pnpm install fait.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"

# Migration deja refletee dans la fixture (= dernier point applique en prod).
# Les migrations dont le timestamp est STRICTEMENT superieur sont rejouees.
FIXTURE_MARKER="20260628000000"
SCHEMA_FIXTURE="tests/journeys/fixtures/schema.sql"
DEV_PORT="3100"
LOCAL_DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
MIG_BAK="$(mktemp -d)"
DEV_PID=""

log() { echo "[journeys] $*"; }

cleanup() {
  log "teardown..."
  [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null
  lsof -ti:"$DEV_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
  supabase stop --no-backup >/dev/null 2>&1 || true
  # restaure les migrations: git checkout pour les fichiers SUIVIS (interrupt-safe,
  # ne depend pas de MIG_BAK qui disparait si le run est tue), + remet tout fichier
  # non-suivi parke dans MIG_BAK (sans ecraser ce que git vient de restaurer).
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
[ -f "$SCHEMA_FIXTURE" ] || { echo "fixture absente: $SCHEMA_FIXTURE (regenere via supabase db dump --schema public)"; exit 1; }

log "init + ecarte les migrations repo (sinon supabase start rejoue la chaine cassee)"
supabase init >/dev/null 2>&1 || true
mv supabase/migrations/*.sql "$MIG_BAK"/ 2>/dev/null || true
# Auto-confirme les emails en local: les parcours signup->login (01) et le seed
# staff tournent sans etape de confirmation par email.
if [ -f supabase/config.toml ]; then
  sed -i '' 's/^enable_confirmations = true/enable_confirmations = false/' supabase/config.toml 2>/dev/null \
    || sed -i 's/^enable_confirmations = true/enable_confirmations = false/' supabase/config.toml 2>/dev/null || true
fi

log "supabase start (stack local vierge)"
supabase start >/dev/null 2>&1 || { echo "supabase start a echoue"; exit 1; }

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

# Cles locales (format sb_publishable_/sb_secret_, acceptees par supabase-js)
eval "$(supabase status -o env 2>/dev/null | sed 's/^/export SB_/')"
API_URL="${SB_API_URL:-http://127.0.0.1:54321}"
ANON="${SB_ANON_KEY:?cle anon introuvable}"
SERVICE="${SB_SERVICE_ROLE_KEY:?cle service_role introuvable}"

log "dev server :$DEV_PORT sur le local (override inline, ne touche pas .env.local)"
# Upstash vide: sinon le rate limiting partage la prod via .env.local, accumule
# l'etat entre runs et fausse les assertions (429 parasites). Vide -> rate limiting
# desactive en dev (rate-limit.ts), isole du prod. Le parcours 07 n'exige pas un
# 429 strict (il verifie l'absence de 5xx).
NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE" \
  UPSTASH_REDIS_REST_URL="" UPSTASH_REDIS_REST_TOKEN="" \
  ALLOW_DEV_AUTH_BYPASS=true PORT="$DEV_PORT" pnpm dev >/tmp/journeys-dev.log 2>&1 &
DEV_PID=$!

log "attente du dev server..."
for _ in $(seq 1 80); do
  code="$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$DEV_PORT/api/health" 2>/dev/null)"
  [ "$code" = "200" ] || [ "$code" = "503" ] && { log "dev pret (health=$code)"; break; }
  sleep 3
done

log "Playwright journeys${1:+ (filtre: $1)}"
JOURNEY_BASE_URL="http://localhost:$DEV_PORT" \
  JOURNEY_SUPABASE_URL="$API_URL" \
  JOURNEY_SUPABASE_SERVICE_ROLE_KEY="$SERVICE" \
  JOURNEY_CONFIRM_TEST_DB=yes \
  npx playwright test --config tests/journeys/playwright.config.ts ${1:-}
RUN_EXIT=$?

log "resultat playwright: exit $RUN_EXIT"
exit $RUN_EXIT
