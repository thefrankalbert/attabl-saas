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
# JOURNEY_SCHEMA_SNAPSHOT=supabase/schema.sql -> utilise l'instantane de reference
# du depot (plus recent que la fixture figee) et lit son propre marqueur
# `SCHEMA_SNAPSHOT_MIGRATION=` en tete de fichier, comme scripts/run-pgtap.sh.
if [ -n "${JOURNEY_SCHEMA_SNAPSHOT:-}" ]; then
  SCHEMA_FIXTURE="$JOURNEY_SCHEMA_SNAPSHOT"
  MARKER_IN_FILE="$(sed -n 's/^-- SCHEMA_SNAPSHOT_MIGRATION=\([0-9]*\).*/\1/p' "$SCHEMA_FIXTURE" 2>/dev/null | head -1)"
  [ -n "$MARKER_IN_FILE" ] && FIXTURE_MARKER="$MARKER_IN_FILE"
fi
# JOURNEY_KEEP_UP=1 -> provisionne puis laisse la stack et le dev server debout
# (banc d'essai pilote par plusieurs agents sur la duree). Arreter le process
# (Ctrl-C) declenche le teardown automatique. Seulement s'il a ete tue de force
# (kill -9), nettoyer a la main: `supabase stop --no-backup` +
# `lsof -ti :3100 | xargs kill -9` + `git checkout -- supabase/migrations/ && rm -rf supabase/config.toml`.
KEEP_UP="${JOURNEY_KEEP_UP:-}"
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
# -x edge-runtime: le projet n'a aucune Edge Function, ce conteneur ne sert donc a
# aucun parcours. Il est en revanche une cause frequente d'echec de `supabase start`
# sur un poste de dev. L'exclure raccourcit le demarrage et supprime cette panne.
supabase start -x edge-runtime >/dev/null 2>&1 || { echo "supabase start a echoue"; exit 1; }

log "charge le schema prod (snapshot) dans le local: $SCHEMA_FIXTURE (marqueur $FIXTURE_MARKER)"
if [ -n "${JOURNEY_SCHEMA_SNAPSHOT:-}" ]; then
  # L'instantane de reference est un pg_dump avec proprietaires et privileges:
  # `CREATE SCHEMA IF NOT EXISTS "public"` et les GRANT sur des roles absents en
  # local echouent sans consequence. On tolere donc les erreurs (comme
  # scripts/run-pgtap.sh) puis on juge sur le nombre de tables obtenu.
  psql "$LOCAL_DB" -q -f "$SCHEMA_FIXTURE" >/dev/null 2>/tmp/journeys-schema.err || true
  TABLES="$(psql "$LOCAL_DB" -X -A -t -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")"
  log "  tables creees: $TABLES"
  [ "${TABLES:-0}" -ge 45 ] || { echo "load schema insuffisant ($TABLES tables, voir /tmp/journeys-schema.err)"; exit 1; }
  # L'instantane ne couvre QUE le schema public: les policies de storage.objects
  # creees par des migrations anterieures au marqueur n'y sont pas, et une
  # migration plus recente qui les modifie (20261108214107) echoue sans elles.
  # ponytail: liste explicite. Si l'instantane est regenere apres une nouvelle
  # migration de storage, l'ajouter ici (l'oubli fait echouer le delta, bruyamment).
  for f in 20260805000200_menu_items_storage_tenant_scoped.sql; do
    log "  storage (hors instantane): $f"
    psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -q -f "$MIG_BAK/$f" >/dev/null || { echo "storage $f echoue"; exit 1; }
  done
else
  psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -q -f "$SCHEMA_FIXTURE" >/dev/null || { echo "load schema echoue"; exit 1; }
fi

log "applique les deltas de migration > $FIXTURE_MARKER"
for f in "$MIG_BAK"/*.sql; do
  ts="$(basename "$f" | cut -d_ -f1)"
  if [[ "$ts" > "$FIXTURE_MARKER" ]]; then
    log "  delta: $(basename "$f")"
    psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null || { echo "delta $f echoue"; exit 1; }
  fi
done
psql "$LOCAL_DB" -c "NOTIFY pgrst, 'reload schema';" >/dev/null 2>&1 || true

# Le snapshot prod ne contient pas l'appartenance a la publication supabase_realtime
# (pg_dump --schema public l'omet). Sans elle, le CDC postgres_changes ne livre rien
# en local et l'assertion KDS temps reel (parcours 04) timeout. On publie `orders`
# (+ REPLICA IDENTITY FULL pour des payloads UPDATE/DELETE complets). LOCAL UNIQUEMENT:
# en prod `orders` est deja publie (le KDS fonctionne), donc rien a migrer cote prod.
log "publie orders dans supabase_realtime (CDC KDS, local uniquement)"
psql "$LOCAL_DB" -q >/dev/null 2>&1 <<'SQL' || true
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders';
  END IF;
END $$;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
SQL

# Cles locales (format sb_publishable_/sb_secret_, acceptees par supabase-js)
eval "$(supabase status -o env 2>/dev/null | sed 's/^/export SB_/')"
API_URL="${SB_API_URL:-http://127.0.0.1:54321}"
ANON="${SB_ANON_KEY:?cle anon introuvable}"
SERVICE="${SB_SERVICE_ROLE_KEY:?cle service_role introuvable}"

# Secret de signature des webhooks Stripe: meme valeur cote app et cote test pour
# que les events forges et signes (parcours 01/06) verifient. Defaut local si non
# fourni. La cle Stripe (sk_test_) cote app permet a /api/webhooks/stripe de relire
# l'abonnement reel via l'API Stripe.
WEBHOOK_SECRET="${JOURNEY_STRIPE_WEBHOOK_SECRET:-whsec_journey_local_test}"

log "dev server :$DEV_PORT sur le local (override inline, ne touche pas .env.local)"
# Upstash vide: sinon le rate limiting partage la prod via .env.local, accumule
# l'etat entre runs et fausse les assertions (429 parasites). Vide -> rate limiting
# desactive en dev (rate-limit.ts), isole du prod. Le parcours 07 n'exige pas un
# 429 strict (il verifie l'absence de 5xx).
NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE" \
  UPSTASH_REDIS_REST_URL="" UPSTASH_REDIS_REST_TOKEN="" \
  STRIPE_SECRET_KEY="${JOURNEY_STRIPE_SECRET_KEY:-}" \
  STRIPE_WEBHOOK_SECRET="$WEBHOOK_SECRET" \
  NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY="${NEXT_PUBLIC_STRIPE_PRICE_STARTER_MONTHLY:-}" \
  NEXT_PUBLIC_STRIPE_PRICE_STARTER_SEMIANNUAL="${NEXT_PUBLIC_STRIPE_PRICE_STARTER_SEMIANNUAL:-}" \
  NEXT_PUBLIC_STRIPE_PRICE_STARTER_YEARLY="${NEXT_PUBLIC_STRIPE_PRICE_STARTER_YEARLY:-}" \
  NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY="${NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY:-}" \
  NEXT_PUBLIC_STRIPE_PRICE_PRO_SEMIANNUAL="${NEXT_PUBLIC_STRIPE_PRICE_PRO_SEMIANNUAL:-}" \
  NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY="${NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY:-}" \
  NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY="${NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY:-}" \
  NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_SEMIANNUAL="${NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_SEMIANNUAL:-}" \
  NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_YEARLY="${NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_YEARLY:-}" \
  ALLOW_DEV_AUTH_BYPASS=true PORT="$DEV_PORT" pnpm dev >/tmp/journeys-dev.log 2>&1 &
DEV_PID=$!

log "attente du dev server..."
DEV_READY=""
for _ in $(seq 1 80); do
  code="$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$DEV_PORT/api/health" 2>/dev/null)"
  [ "$code" = "200" ] || [ "$code" = "503" ] && { log "dev pret (health=$code)"; DEV_READY=1; break; }
  sleep 3
done

if [ -n "$KEEP_UP" ]; then
  # Sans ce garde, un dev server mort annoncait quand meme "BANC PRET".
  [ -n "$DEV_READY" ] || { echo "dev server non pret apres 240 s (voir /tmp/journeys-dev.log)"; exit 1; }
  log "BANC PRET: app=http://localhost:$DEV_PORT  api=$API_URL  studio=http://127.0.0.1:54323"
  log "SERVICE_ROLE_LOCAL=$SERVICE"
  log "ANON_LOCAL=$ANON"
  log "La stack reste debout. Arreter ce process declenche le teardown complet."
  wait "$DEV_PID"
  exit 0
fi

log "Playwright journeys${1:+ (filtre: $1)}"
# JOURNEY_STRIPE_SECRET_KEY (sk_test_...) est transmis depuis l'environnement si
# fourni -> debloque le checkout (01) et les Test Clocks (06). Optionnel.
JOURNEY_BASE_URL="http://localhost:$DEV_PORT" \
  JOURNEY_SUPABASE_URL="$API_URL" \
  JOURNEY_SUPABASE_SERVICE_ROLE_KEY="$SERVICE" \
  JOURNEY_STRIPE_SECRET_KEY="${JOURNEY_STRIPE_SECRET_KEY:-}" \
  JOURNEY_STRIPE_WEBHOOK_SECRET="$WEBHOOK_SECRET" \
  JOURNEY_CONFIRM_TEST_DB=yes \
  npx playwright test --config tests/journeys/playwright.config.ts ${1:-}
RUN_EXIT=$?

log "resultat playwright: exit $RUN_EXIT"
exit $RUN_EXIT
