#!/usr/bin/env bash
# Ouvre (ou complete) l'issue d'alerte de la sauvegarde nocturne. GitHub en
# previent le proprietaire du depot par e-mail. Une seule issue ouverte a la
# fois: les alertes suivantes s'y ajoutent en commentaire.
#
# usage: signaler.sh "<message>"   (GH_TOKEN et GITHUB_REPOSITORY requis)
set -euo pipefail
MESSAGE="${1:?message requis}"
TITRE="Sauvegarde nocturne: alerte"
EXISTANTE="$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --search "in:title \"$TITRE\"" --json number --jq '.[0].number // empty')"
if [ -n "$EXISTANTE" ]; then
  gh issue comment "$EXISTANTE" --repo "$GITHUB_REPOSITORY" --body "$MESSAGE"
  echo "alerte: commentaire ajoute a l'issue #$EXISTANTE"
else
  gh issue create --repo "$GITHUB_REPOSITORY" --title "$TITRE" --body "$MESSAGE"
  echo "alerte: issue ouverte"
fi
