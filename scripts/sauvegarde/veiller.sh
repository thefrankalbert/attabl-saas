#!/usr/bin/env bash
# Verifie qu'une sauvegarde nocturne REUSSIE date de moins de SEUIL_H heures
# (30 par defaut), sinon ouvre l'issue d'alerte et sort en erreur.
# GH_TOKEN et GITHUB_REPOSITORY requis. Sortie: ^veille: OK|ALERTE
set -euo pipefail
SEUIL_H="${SEUIL_H:-30}"
DERNIERE="$(gh run list --repo "$GITHUB_REPOSITORY" --workflow sauvegarde.yml --branch main \
  --status success --limit 1 --json createdAt --jq '.[0].createdAt // empty')"
MAINTENANT="$(date -u +%s)"
if [ -z "$DERNIERE" ]; then
  AGE=999999
else
  AGE=$(( (MAINTENANT - $(date -u -d "$DERNIERE" +%s)) / 3600 ))
fi
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "derniere sauvegarde reussie: ${DERNIERE:-aucune} (il y a ${AGE} h)" >> "$GITHUB_STEP_SUMMARY"
fi
if [ "$AGE" -ge "$SEUIL_H" ]; then
  bash "$(dirname "$0")/signaler.sh" "Aucune sauvegarde reussie depuis ${AGE} h (derniere : ${DERNIERE:-aucune}). Lancer la sauvegarde a la main (Actions > Sauvegarde et restauration > Run workflow) et verifier les secrets BACKUP_DB_URL et BACKUP_PASSPHRASE."
  echo "veille: ALERTE (${AGE} h)"
  exit 1
fi
echo "veille: OK (${AGE} h)"
