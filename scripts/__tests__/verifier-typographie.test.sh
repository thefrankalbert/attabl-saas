#!/usr/bin/env bash
# Teste scripts/verifier-typographie.sh sur des fichiers fabriques.
set -uo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
ECHECS=0
cas() { # nom, contenu, extension, code attendu
  rm -rf "$TMP/d"; mkdir -p "$TMP/d"
  printf '%s\n' "$2" > "$TMP/d/f.$3"
  bash "$RACINE/scripts/verifier-typographie.sh" "$TMP/d" > /dev/null 2>&1; CODE=$?
  if [ "$CODE" = "$4" ]; then echo "ok - $1"; else echo "not ok - $1 (code=$CODE)"; ECHECS=$((ECHECS+1)); fi
}
cas "texte ASCII accepte" "const a = 'Fini les tickets - simple.';" tsx 0
cas "accents francais acceptes" $'{"t": "Pr\u00e9par\u00e9e, \u00e0 emporter, d\u00e9j\u00e0 \u00e7a"}' json 0
cas "tiret long refuse" $'texte — incise' tsx 1
cas "points de suspension unicode refuses" $'Chargement…' json 1
cas "guillemets francais refuses" $'« citation »' tsx 1
cas "apostrophe typographique refusee" $'l’addition' tsx 1
cas "Markdown admis" $'Titre — sous-titre' md 0
if [ "$ECHECS" = 0 ]; then
  echo "verifier-typographie: 7/7 passed"
else
  echo "verifier-typographie: $ECHECS failed"
  exit 1
fi
