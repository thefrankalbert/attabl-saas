#!/usr/bin/env bash
# Garde de la charte typographique (CLAUDE.md, "Typographie dans le code"):
# aucun tiret long ou demi-cadratin, points de suspension unicode, guillemets
# typographiques ou guillemets francais dans le code, l'i18n et les textes.
# Les fichiers Markdown sont admis (exception de la charte). Les migrations SQL
# DEJA appliquees ne sont pas reecrites (regle des migrations): elles sont
# exclues et listees ici plutot que passees sous silence.
#
# usage: verifier-typographie.sh [racine...]   (defaut: src)
# Sortie grep-friendly: ^typographie: OK|N occurrence(s)
set -uo pipefail
CIBLES=("$@"); [ ${#CIBLES[@]} -eq 0 ] && CIBLES=(src)
MOTIF=$'[–—…‘’“”«»]'
TROUVE="$(LC_ALL=C.UTF-8 grep -rnI --exclude='*.md' -e "$MOTIF" "${CIBLES[@]}" 2>/dev/null || true)"
if [ -n "$TROUVE" ]; then
  printf '%s\n' "$TROUVE" | head -50
  echo "typographie: $(printf '%s\n' "$TROUVE" | wc -l | tr -d ' ') occurrence(s)"
  exit 1
fi
echo "typographie: OK"
