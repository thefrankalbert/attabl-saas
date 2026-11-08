#!/usr/bin/env bash
#
# Preuve que `promote-prod.sh` ne crie plus ERROR quand la promotion etait DEJA
# faite (HTTP 409).
#
# LE DEFAUT VERROUILLE ICI, mesure le 2026-11-08 sur le commit 555697d4: le
# workflow `promote-prod` tourne apres chaque push sur main, donc une execution
# lancee a la main en parallele trouve le travail deja fait. Vercel repond 409
# "already the current production deployment" - l'etat recherche - et le script
# sortait en `prod: ERROR`. Le deploiement etait pourtant promu et servi.
# Un faux rouge sur cet outil fait chercher une panne qui n'existe pas.
#
# Le test remplace `curl` par une doublure: aucune requete ne part, ni vers
# Vercel ni vers le domaine de production.
#
# Execution: bash scripts/__tests__/promote-prod-409.test.sh
#
# SCRIPT_SOUS_TEST permet de viser une autre copie du script - c'est ainsi qu'on
# prouve que ce test est ROUGE sur la version d'avant la correction:
#   git show main:scripts/promote-prod.sh > /tmp/avant.sh
#   SCRIPT_SOUS_TEST=/tmp/avant.sh bash scripts/__tests__/promote-prod-409.test.sh
set -uo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
BAC="$(mktemp -d)"
trap 'rm -rf "$BAC"' EXIT

# Commits fictifs: le test ne doit rien devoir a l'etat du clone (en CI,
# `origin/main` peut ne pas exister et `git fetch` partirait sur le reseau).
ATTENDU="1111111111111111111111111111111111111111"
ANCIEN="0000000000000000000000000000000000000000"

# Doublure de git: le script ne s'en sert que pour connaitre le commit attendu.
GIT_REEL="$(command -v git)"
cat > "$BAC/git" <<DOUBLURE_GIT
#!/usr/bin/env bash
if [[ "\$1" == "fetch" ]]; then exit 0; fi
if [[ "\$1" == "rev-parse" && "\$2" == "origin/main" ]]; then echo "$ATTENDU"; exit 0; fi
exec "$GIT_REEL" "\$@"
DOUBLURE_GIT
chmod +x "$BAC/git"

# Doublure de curl. Elle sert trois appels du script:
#   - /api/version        -> l'ancien commit au 1er appel, l'attendu ensuite
#                            (le domaine rattrape apres la promotion);
#   - liste des deploiements -> un deploiement READY pour le commit attendu;
#   - POST de promotion   -> le code HTTP demande par le test.
cat > "$BAC/curl" <<DOUBLURE
#!/usr/bin/env bash
ARGS="\$*"
COMPTEUR="$BAC/compteur"
if [[ "\$ARGS" == *"/api/version"* ]]; then
  N=\$(cat "\$COMPTEUR" 2>/dev/null || echo 0); echo \$((N + 1)) > "\$COMPTEUR"
  if [[ "\$N" -eq 0 ]]; then echo '{"version":"$ANCIEN"}'; else echo '{"version":"$ATTENDU"}'; fi
  exit 0
fi
if [[ "\$ARGS" == *"/v6/deployments"* ]]; then
  echo '{"deployments":[{"uid":"dpl_test","url":"essai.vercel.app","state":"READY","readySubstate":"STAGED","meta":{"githubCommitSha":"$ATTENDU"}}]}'
  exit 0
fi
if [[ "\$ARGS" == *"/promote/"* ]]; then
  echo '{"error":{"code":"conflict","message":"already the current production deployment"}}' > /tmp/promote-resp.json
  printf '%s' "\$CODE_PROMOTION"
  exit 0
fi
exit 1
DOUBLURE
chmod +x "$BAC/curl"

lancer() {
  CODE_PROMOTION="$1" PATH="$BAC:$PATH" PROMOTE_DELAI_VERIFICATION_S=1 \
  VERCEL_TOKEN=jeton-de-test VERCEL_PROJECT_ID=prj_test VERCEL_TEAM_ID=team_test \
    bash "${SCRIPT_SOUS_TEST:-$RACINE/scripts/promote-prod.sh}" 2>&1
}

echecs=0
verifier() {
  local cas="$1" attendu="$2" sortie="$3" code="$4" code_attendu="$5"
  local ligne
  ligne="$(printf '%s' "$sortie" | grep -E '^prod: ' | tail -1)"
  if [[ "$ligne" == *"$attendu"* && "$code" == "$code_attendu" ]]; then
    echo "  ok    $cas -> $ligne (sortie $code)"
  else
    echo "  CASSE $cas -> attendu '$attendu' et sortie $code_attendu, obtenu '$ligne' et sortie $code"
    echecs=$((echecs + 1))
  fi
}

echo "promote-prod 409:"

rm -f "$BAC/compteur"
SORTIE="$(lancer 409)"; CODE=$?
verifier "409 = deja promu, pas une panne" "IN-SYNC" "$SORTIE" "$CODE" 0

rm -f "$BAC/compteur"
SORTIE="$(lancer 200)"; CODE=$?
verifier "200 = promotion demandee par nous" "PROMOTED" "$SORTIE" "$CODE" 0

# Non-regression: un vrai refus doit RESTER une erreur. Sans ce cas, traiter le
# 409 comme un succes pourrait se generaliser a tout code d'erreur.
rm -f "$BAC/compteur"
SORTIE="$(lancer 401)"; CODE=$?
verifier "401 reste une erreur (token refuse)" "ERROR" "$SORTIE" "$CODE" 1

rm -f "$BAC/compteur"
SORTIE="$(lancer 403)"; CODE=$?
verifier "403 reste une erreur" "ERROR" "$SORTIE" "$CODE" 1

if [[ "$echecs" -eq 0 ]]; then
  echo "promote-prod: 4/4 passed"
  exit 0
fi
echo "promote-prod: $echecs cas casse(s)"
exit 1
