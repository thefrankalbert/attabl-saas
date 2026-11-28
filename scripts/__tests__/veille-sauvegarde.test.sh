#!/usr/bin/env bash
# Teste scripts/sauvegarde/veiller.sh avec un faux `gh` (aucun appel reseau).
# Cas: sauvegarde recente -> OK sans alerte ; ancienne -> ALERTE et issue ;
# aucune -> ALERTE. Necessite GNU date (Linux, ou gdate expose en `date`).
set -uo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/gh" <<'GH'
#!/usr/bin/env bash
case "$1 $2" in
  "run list") printf '%s' "${FAUX_DERNIERE:-}" ;;
  "issue list") printf '' ;;
  "issue create") echo "ISSUE_CREEE" >> "$JOURNAL" ;;
  "issue comment") echo "ISSUE_COMMENTEE" >> "$JOURNAL" ;;
esac
GH
chmod +x "$TMP/gh"
export PATH="$TMP:$PATH" GITHUB_REPOSITORY=exemple/depot JOURNAL="$TMP/journal"
ECHECS=0
cas() { # nom, derniere date, code attendu, issue attendue (oui/non)
  : > "$JOURNAL"
  FAUX_DERNIERE="$2" bash "$RACINE/scripts/sauvegarde/veiller.sh" > "$TMP/sortie" 2>&1; CODE=$?
  ISSUE=non; grep -q ISSUE_ "$JOURNAL" && ISSUE=oui
  if [ "$CODE" = "$3" ] && [ "$ISSUE" = "$4" ]; then echo "ok - $1"; else echo "not ok - $1 (code=$CODE issue=$ISSUE)"; cat "$TMP/sortie"; ECHECS=$((ECHECS+1)); fi
}
cas "sauvegarde il y a 2 h: pas d'alerte" "$(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%SZ)" 0 non
cas "sauvegarde il y a 40 h: alerte" "$(date -u -d '40 hours ago' +%Y-%m-%dT%H:%M:%SZ)" 1 oui
cas "aucune sauvegarde: alerte" "" 1 oui
if [ "$ECHECS" = 0 ]; then
  echo "veille-sauvegarde: 3/3 passed"
else
  echo "veille-sauvegarde: $ECHECS failed"
  exit 1
fi
