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
#   ./scripts/promote-prod.sh                # verifie, et promeut si necessaire
#   ./scripts/promote-prod.sh --check        # verifie seulement, ne promeut pas
#   ./scripts/promote-prod.sh --wait 25      # attend que le build soit READY (CI)
#
# Authentification : VERCEL_TOKEN, sinon le token du CLI (`vercel login`).
# Sortie grep-friendly : ^prod: IN-SYNC|PROMOTED|OUT-OF-SYNC|NOT-READY|ERROR

set -euo pipefail

DOMAIN="${PROD_DOMAIN:-https://attabl.com}"
CHECK_ONLY=false
WAIT_MINUTES=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK_ONLY=true ;;
    --wait)
      if [[ -z "${2:-}" || ! "$2" =~ ^[0-9]+$ ]]; then
        echo "usage: $0 [--check] [--wait <minutes>]" >&2
        exit 2
      fi
      WAIT_MINUTES="$2"
      shift
      ;;
    *)
      echo "usage: $0 [--check] [--wait <minutes>]" >&2
      exit 2
      ;;
  esac
  shift
done

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
# En CI, .vercel/ n'existe pas (gitignore) : les IDs viennent de l'environnement.
# Ce ne sont pas des secrets, ils sont poses en clair dans le workflow.
PROJECT_ID="${VERCEL_PROJECT_ID:-}"
TEAM_ID="${VERCEL_TEAM_ID:-}"
LINK="${ROOT}/.vercel/project.json"
if [[ -z "$PROJECT_ID" && -f "$LINK" ]]; then
  PROJECT_ID="$(node -p "require('${LINK}').projectId")"
  TEAM_ID="$(node -p "require('${LINK}').orgId || ''")"
fi
if [[ -z "$PROJECT_ID" ]]; then
  echo "prod: ERROR - projet inconnu (definir VERCEL_PROJECT_ID ou lancer 'vercel link')"
  exit 1
fi

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

find_deployment() {
  local response
  response="$(curl -fsS "$API" -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || true)"
  if [[ -z "$response" || "$response" == *'"error"'* ]]; then
    echo "APIFAIL - -"
    return
  fi
  EXPECTED="$EXPECTED" RESPONSE="$response" node -e '
const deps = (JSON.parse(process.env.RESPONSE).deployments || []).filter(
  (d) => (d.meta || {}).githubCommitSha === process.env.EXPECTED,
);
const ready = deps.find((d) => d.state === "READY");
if (ready) process.stdout.write(`READY ${ready.uid} https://${ready.url} ${ready.readySubstate || "?"}`);
else if (deps.length) process.stdout.write(`${deps[0].state} - - -`);
else process.stdout.write("ABSENT - - -");
'
}

# Le build Vercel prend quelques minutes : en CI on attend qu'il soit READY
# plutot que d'echouer. En local (WAIT_MINUTES=0) on rend la main tout de suite.
DEADLINE=$(($(date +%s) + WAIT_MINUTES * 60))
while :; do
  read -r STATE DEPLOY_ID DEPLOY_URL SUBSTATE <<<"$(find_deployment)"
  [[ "$STATE" == "READY" ]] && break
  if [[ "$STATE" == "APIFAIL" ]]; then
    echo "prod: ERROR - API Vercel inaccessible (token expire ? relancer 'vercel login')"
    exit 1
  fi
  if [[ "$STATE" == "ERROR" || "$STATE" == "CANCELED" ]]; then
    echo "prod: ERROR - le deploiement de ${EXPECTED:0:8} a echoue (${STATE})"
    exit 1
  fi
  if (($(date +%s) >= DEADLINE)); then
    echo "prod: NOT-READY - aucun deploiement production READY pour ${EXPECTED:0:8} (etat: ${STATE})"
    [[ "$WAIT_MINUTES" -gt 0 ]] && echo "  -> toujours pas pret apres ${WAIT_MINUTES} min"
    echo "  -> build en cours ou en echec : verifier sur vercel.com avant de reessayer"
    exit 1
  fi
  echo "  build ${STATE} pour ${EXPECTED:0:8}, nouvelle tentative dans 30 s..."
  sleep 30
done

echo "deploiement cible     : ${DEPLOY_URL} (substate ${SUBSTATE})"
# Promotion via l'API et non le CLI: `vercel promote` charge d'abord le profil
# utilisateur et echoue en "User not found (404)" avec un token a portee limitee
# (constate en CI). L'API accepte ce token - c'est elle qui a trouve le deploiement.
PROMOTE_API="https://api.vercel.com/v10/projects/${PROJECT_ID}/promote/${DEPLOY_ID}"
[[ -n "$TEAM_ID" ]] && PROMOTE_API="${PROMOTE_API}?teamId=${TEAM_ID}"
HTTP_CODE="$(curl -s -o /tmp/promote-resp.json -w '%{http_code}' -X POST "$PROMOTE_API" -H "Authorization: Bearer ${TOKEN}")"

# UN 409 N'EST PAS UNE PANNE, c'est l'etat recherche deja atteint.
#
# Vercel repond 409 "The provided deploymentId is already the current production
# deployment". C'est exactement ce qu'on voulait. Et ca arrive tout le temps: le
# workflow `promote-prod` tourne apres chaque push sur main, donc une execution
# lancee a la main en parallele trouve le travail deja fait.
#
# Le script sortait alors en ERROR (mesure le 2026-11-08 sur 555697d4, promu et
# servi correctement). Un faux rouge sur cet outil-la coute cher: le depot
# documente justement comme piege le fait de conclure "la promotion est
# bloquee". On ne croit pas pour autant le message de l'API: c'est le domaine
# qui tranche, plus bas.
if [[ "$HTTP_CODE" == 409 ]]; then
  echo "promotion deja faite par ailleurs (HTTP 409) - verification du domaine"
elif [[ "$HTTP_CODE" != 2* ]]; then
  echo "prod: ERROR - l'API de promotion a repondu HTTP ${HTTP_CODE}"
  head -c 300 /tmp/promote-resp.json; echo
  exit 1
else
  echo "promotion demandee (HTTP ${HTTP_CODE})"
fi

# L'assignation du domaine n'est pas instantanee. Un seul controle apres 15 s
# declarait en erreur un domaine qui n'avait besoin que de quelques secondes de
# plus - le meme faux rouge, a l'autre bout du script. On laisse donc jusqu'a
# 90 s, en s'arretant des que c'est bon. Le delai est reglable pour que les
# tests du script n'attendent pas pour rien.
DELAI_VERIFICATION_S="${PROMOTE_DELAI_VERIFICATION_S:-15}"
for _ in 1 2 3 4 5 6; do
  sleep "$DELAI_VERIFICATION_S"
  SERVED="$(served_sha || true)"
  if [[ "$SERVED" == "$EXPECTED" ]]; then
    if [[ "$HTTP_CODE" == 409 ]]; then
      echo "prod: IN-SYNC - ${DOMAIN} servait deja ${SERVED:0:8}"
    else
      echo "prod: PROMOTED - ${DOMAIN} sert maintenant ${SERVED:0:8}"
    fi
    exit 0
  fi
done

echo "prod: ERROR - 90 s apres la promotion, ${DOMAIN} sert toujours ${SERVED:0:8}"
exit 1
