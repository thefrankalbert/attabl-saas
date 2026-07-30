#!/usr/bin/env bash
#
# Verifie que le domaine de production sert bien le dernier commit de main,
# et promeut le deploiement Vercel si ce n'est pas le cas.
#
# Pourquoi ce script existe (2026-07-30) : sur ce projet, un merge sur main cree
# bien un deploiement `target=production` qui passe READY, mais Vercel ne lui
# assigne PAS toujours le domaine attabl.com. C'est arrive au moins deux fois :
#   - 503c0eec (PR #293, vitrine marketing) : jamais aliase, prod restee sur
#     l'ancien build pendant des jours sans que personne le voie
#   - 6cb54d46 (PR #294) : aliase seulement apres un `vercel promote` manuel
# La configuration du projet est pourtant saine (productionBranch=main, domaines
# verifies, autoAssignCustomDomains=true, aucun rolling release ni rollback) -
# le comportement vient de la plateforme, pas d'un reglage a corriger.
#
# Le discriminant fiable est /api/version : il renvoie le SHA du commit servi.
# Ne PAS se fier au check "Vercel" de GitHub, qui reste "pending" bien apres que
# le deploiement soit READY.
#
# Usage :
#   ./scripts/promote-prod.sh            # verifie, et promeut si necessaire
#   ./scripts/promote-prod.sh --check    # verifie seulement, ne promeut pas
#
# Sortie grep-friendly : ^prod: IN-SYNC|PROMOTED|OUT-OF-SYNC|ERROR

set -euo pipefail

DOMAIN="${PROD_DOMAIN:-https://attabl.com}"
CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

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
echo "servi par ${DOMAIN} : ${SERVED:0:8}"

if [[ "$SERVED" == "$EXPECTED" ]]; then
  echo "prod: IN-SYNC"
  exit 0
fi

if [[ "$CHECK_ONLY" == true ]]; then
  echo "prod: OUT-OF-SYNC - lancer ./scripts/promote-prod.sh pour promouvoir"
  exit 1
fi

# Le deploiement production le plus recent porte le commit de main : c'est celui
# a promouvoir. `vercel ls` liste du plus recent au plus ancien.
DEPLOY_URL="$(npx --yes vercel ls attabl-saas --yes 2>/dev/null | grep -oE 'https://attabl-saas-[a-z0-9]+-[a-z0-9-]+\.vercel\.app' | head -1)"
if [[ -z "$DEPLOY_URL" ]]; then
  echo "prod: ERROR - aucun deploiement trouve (vercel login ?)"
  exit 1
fi

echo "promotion de ${DEPLOY_URL}..."
npx --yes vercel promote "$DEPLOY_URL" --yes

sleep 5
SERVED="$(served_sha || true)"
if [[ "$SERVED" == "$EXPECTED" ]]; then
  echo "prod: PROMOTED - ${DOMAIN} sert maintenant ${SERVED:0:8}"
  exit 0
fi

echo "prod: ERROR - apres promotion, ${DOMAIN} sert toujours ${SERVED:0:8}"
exit 1
