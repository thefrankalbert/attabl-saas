#!/usr/bin/env bash
#
# Refuse deux fichiers de migration qui portent la meme version (audit B137).
#
# POURQUOI. `supabase_migrations.schema_migrations` est indexee par VERSION (les
# 14 premiers chiffres du nom). Deux fichiers de meme version: `supabase db
# push` peut en refuser un ou le croire deja applique, et
# `appliquer-migrations-ciblees.sh` (`on conflict (version) do nothing`)
# affiche "deja enregistree" meme si un seul des deux est passe.
#
# EXCEPTION CONNUE, NE PAS EN AJOUTER. `20261107160000` porte deux fichiers
# (`rls_roles_ecritures_lot3` et `numerotation_commandes_non_reutilisable`).
# Les deux sont appliques en production (verifie le 2026-11-24 par leurs
# objets: la politique "Menu managers can insert own tenant coupons" et le
# corps de `next_order_number` du second fichier), et la version n'est
# enregistree qu'une fois. Renommer un fichier deja applique ferait croire a
# `db push` qu'une migration NOUVELLE est a rejouer: on garde les deux noms et
# on interdit toute nouvelle collision.
#
# Usage: scripts/verifier-versions-migrations.sh [dossier]   (defaut: supabase/migrations)
# Sortie grep-friendly: ^versions-migrations: OK|DOUBLON <version>
set -euo pipefail

DOSSIER="${1:-supabase/migrations}"
# Exception epinglee par NOMS EXACTS (contre-audit 1): un troisieme fichier de
# cette version, ou un autre nom, est refuse comme toute collision.
EXCEPTION_VERSION="20261107160000"
EXCEPTION_FICHIERS="20261107160000_numerotation_commandes_non_reutilisable.sql
20261107160000_rls_roles_ecritures_lot3.sql"

if [ ! -d "$DOSSIER" ]; then
  echo "versions-migrations: ERREUR dossier introuvable: $DOSSIER"
  exit 2
fi

doublons="$(
  find "$DOSSIER" -maxdepth 1 -type f -name '[0-9]*_*.sql' -exec basename {} \; \
    | cut -c1-14 | sort | uniq -d
)"

echec=0
for v in $doublons; do
  if [ "$v" = "$EXCEPTION_VERSION" ]; then
    presents="$(find "$DOSSIER" -maxdepth 1 -type f -name "${v}_*.sql" -exec basename {} \; | LC_ALL=C sort)"
    if [ "$presents" = "$EXCEPTION_FICHIERS" ]; then
      continue
    fi
  fi
  echo "versions-migrations: DOUBLON $v"
  find "$DOSSIER" -maxdepth 1 -type f -name "${v}_*.sql" -exec basename {} \; | sed 's/^/  /'
  echec=1
done

if [ "$echec" -ne 0 ]; then
  exit 1
fi
echo "versions-migrations: OK"
