#!/usr/bin/env bash
#
# Preuve que `verifier-worktrees.sh` regarde les DEUX emplacements de worktrees.
#
# LE DEFAUT VERROUILLE ICI, constate le 2026-11-28. Le script ne parcourait que
# `.worktrees/*/`. Or l'application cree ses worktrees dans `.claude/worktrees/`:
# 31 d'entre eux echappaient donc a la verification du magasin pnpm ET a
# l'inventaire, dont un dossier fantome portant 6 fichiers non commites
# (`feat+qr-reports-overhaul`). Le script repondait "worktrees: OK" sans avoir
# regarde la moitie du disque - le pire etat pour un garde-fou, puisqu'il
# rassure.
#
# Le test ne touche ni au vrai depot ni au reseau: il monte un faux projet dans
# un bac a sable et y copie le script.
#
# Execution: bash scripts/__tests__/verifier-worktrees-emplacements.test.sh
#
# SCRIPT_SOUS_TEST vise une autre copie du script - c'est ainsi qu'on prouve que
# ce test est ROUGE sur la version d'avant la correction:
#   git show origin/main:scripts/verifier-worktrees.sh > /tmp/avant.sh
#   SCRIPT_SOUS_TEST=/tmp/avant.sh bash scripts/__tests__/verifier-worktrees-emplacements.test.sh
set -uo pipefail
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
SOUS_TEST="${SCRIPT_SOUS_TEST:-$RACINE/scripts/verifier-worktrees.sh}"
BAC="$(mktemp -d)"
trap 'rm -rf "$BAC"' EXIT

REUSSIS=0
TOTAL=0
echouer() { echo "  ECHEC: $1"; }
verifier() {
  local titre="$1" attendu="$2" obtenu="$3"
  TOTAL=$((TOTAL + 1))
  if [[ "$obtenu" == "$attendu" ]]; then
    REUSSIS=$((REUSSIS + 1))
  else
    echouer "$titre (attendu '$attendu', obtenu '$obtenu')"
  fi
}

# Monte un faux projet: <bac>/scripts/<script> pour que ROOT tombe sur <bac>.
monter() {
  local emplacement="$1" magasin="$2"
  rm -rf "$BAC/projet"
  mkdir -p "$BAC/projet/scripts" "$BAC/projet/$emplacement/faux/node_modules"
  cp "$SOUS_TEST" "$BAC/projet/scripts/verifier-worktrees.sh"
  printf '{\n  "virtualStoreDir": "%s"\n}\n' "$magasin" \
    > "$BAC/projet/$emplacement/faux/node_modules/.modules.yaml"
}

lancer() { bash "$BAC/projet/scripts/verifier-worktrees.sh" --quiet >/dev/null 2>&1; echo $?; }

DERIVE="../../.worktrees/ailleurs/node_modules/.pnpm"
SAIN=".pnpm"

# TEMOIN POSITIF. L'emplacement historique etait deja couvert: s'il cesse de
# l'etre, la correction aurait casse ce qui marchait.
monter ".worktrees" "$DERIVE"
verifier "derive detectee dans .worktrees/" "1" "$(lancer)"

# LE DEFAUT. C'est cette ligne qui est rouge sur la version d'avant.
monter ".claude/worktrees" "$DERIVE"
verifier "derive detectee dans .claude/worktrees/" "1" "$(lancer)"

# TEMOIN NEGATIF. Une mesure qui ne sait pas dire non ne verifie rien: sur un
# magasin sain, les deux emplacements doivent rester silencieux.
monter ".worktrees" "$SAIN"
verifier "magasin sain accepte dans .worktrees/" "0" "$(lancer)"
monter ".claude/worktrees" "$SAIN"
verifier "magasin sain accepte dans .claude/worktrees/" "0" "$(lancer)"

echo "verifier-worktrees: $REUSSIS/$TOTAL passed"
[[ "$REUSSIS" == "$TOTAL" ]] || exit 1
