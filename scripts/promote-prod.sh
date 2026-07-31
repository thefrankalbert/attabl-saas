#!/usr/bin/env bash
#
# Verifie que le domaine de production sert bien le dernier commit de main,
# et promeut le deploiement Vercel correspondant si ce n'est pas le cas.
#
# Pourquoi ce script existe (2026-07-30) : sur ce projet, un merge sur main cree
# bien un deploiement `target=production` qui passe READY, mais Vercel ne lui
# assigne PAS toujours le domaine attabl.com. Le code est alors builde mais
# jamais servi. Mesure sur les 13 derniers deploiements production : l'assignation
# se faisait en 1-2 s jusqu'au 21/07/2026, et plus jamais depuis le 26/07
# (503c0eec, la vitrine marketing, est reste STAGED pendant des jours).
# La configuration du projet est saine (productionBranch=main, domaines verifies,
# autoAssignCustomDomains=true, pas de rolling release) : le comportement vient
# de la plateforme, il n'y a pas de reglage a corriger cote projet.
#
# Le deploiement a promouvoir est choisi par son COMMIT, jamais "le plus recent" :
# le plus recent peut etre la preview d'une branche de feature, et la promouvoir
# enverrait du code non merge en production.
#
# Usage :
#   ./scripts/promote-prod.sh            # verifie, et promeut si necessaire
#   ./scripts/promote-prod.sh --check    # verifie seulement, ne promeut pas
#
# Authentification : VERCEL_TOKEN, sinon le token du CLI (`vercel login`).
# Sortie grep-friendly : ^prod: IN-SYNC|PROMOTED|OUT-OF-SYNC|NOT-READY|ERROR

set -euo pipefail

DOMAIN="${PROD_DOMAIN:-https://attabl.com}"
CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

git fetch origin --quiet
EXPECTED="$(git rev-parse origin/main)"

served_sha() {
  curl -fsS "${DOMAIN}/api/version?cb=$(date +%s)" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'
}

SERVED="$(served_sha || true)"
if [[ -z "$SERVED" ]]; then
  echo "prod: ERROR - ${DOMAIN}/api/version injoignable"
  exit 1
fi

echo "attendu (origin/main) : ${EXPECTED:0:8}"
echo "servi par ${DOMAIN}   : ${SERVED:0:8}"

if [[ "$SERVED" == "$EXPECTED" ]]; then
  echo "prod: IN-SYNC"
  exit 0
fi

if [[ "$CHECK_ONLY" == true ]]; then
  echo "prod: OUT-OF-SYNC - lancer ./scripts/promote-prod.sh pour promouvoir"
  exit 1
fi

# --- Identite du projet -----------------------------------------------------
LINK="${ROOT}/.vercel/project.json"
if [[ ! -f "$LINK" ]]; then
  echo "prod: ERROR - ${LINK} introuvable (lancer 'vercel link')"
  exit 1
fi
PROJECT_ID="$(node -p "require('${LINK}').projectId")"
TEAM_ID="$(node -p "require('${LINK}').orgId || ''")"

# --- Token ------------------------------------------------------------------
TOKEN="${VERCEL_TOKEN:-}"
if [[ -z "$TOKEN" ]]; then
  for AUTH in "$HOME/Library/Application Support/com.vercel.cli/auth.json" \
    "$HOME/.local/share/com.vercel.cli/auth.json"; do
    if [[ -f "$AUTH" ]]; then
      TOKEN="$(node -p "require(process.argv[1]).token || ''" "$AUTH" 2>/dev/null || true)"
      [[ -n "$TOKEN" ]] && break
    fi
  done
fi
if [[ -z "$TOKEN" ]]; then
  echo "prod: ERROR - pas de token Vercel (definir VERCEL_TOKEN ou lancer 'vercel login')"
  exit 1
fi

# --- Selection du deploiement PAR COMMIT ------------------------------------
API="https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&target=production&limit=20"
[[ -n "$TEAM_ID" ]] && API="${API}&teamId=${TEAM_ID}"

RESPONSE="$(curl -fsS "$API" -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || true)"
if [[ -z "$RESPONSE" || "$RESPONSE" == *'"error"'* ]]; then
  echo "prod: ERROR - API Vercel inaccessible (token expire ? relancer 'vercel login')"
  exit 1
fi

MATCH="$(EXPECTED="$EXPECTED" RESPONSE="$RESPONSE" node -e '
const deps = (JSON.parse(process.env.RESPONSE).deployments || []).filter(
  (d) => (d.meta || {}).githubCommitSha === process.env.EXPECTED,
);
const ready = deps.find((d) => d.state === "READY");
if (ready) process.stdout.write(`READY https://${ready.url} ${ready.readySubstate || "?"}`);
else if (deps.length) process.stdout.write(`${deps[0].state} - -`);
else process.stdout.write("ABSENT - -");
')"

read -r STATE DEPLOY_URL SUBSTATE <<<"$MATCH"

if [[ "$STATE" != "READY" ]]; then
  echo "prod: NOT-READY - aucun deploiement production READY pour ${EXPECTED:0:8} (etat: ${STATE})"
  echo "  -> build en cours ou en echec : verifier sur vercel.com avant de reessayer"
  exit 1
fi

echo "deploiement cible     : ${DEPLOY_URL} (substate ${SUBSTATE})"
npx --yes vercel promote "$DEPLOY_URL" --scope "$TEAM_ID" 2>&1 | tail -2

sleep 5
SERVED="$(served_sha || true)"
if [[ "$SERVED" == "$EXPECTED" ]]; then
  echo "prod: PROMOTED - ${DOMAIN} sert maintenant ${SERVED:0:8}"
  exit 0
fi

echo "prod: ERROR - apres promotion, ${DOMAIN} sert toujours ${SERVED:0:8}"
exit 1
