#!/usr/bin/env bash
# Verrouille scripts/verifier-versions-migrations.sh (audit B137): deux
# migrations de meme version sont refusees, sauf l'exception documentee
# 20261107160000. Le premier cas joue le script sur le VRAI dossier du depot:
# c'est la garde de CI. Sortie: ^versions-migrations-test: N/N passed
set -euo pipefail
cd "$(dirname "$0")/../.."

bac="$(mktemp -d)"
trap 'rm -rf "$bac"' EXIT

passed=0
total=0
cas() { # nom code_attendu dossier
  local nom="$1" attendu="$2" dossier="$3"
  total=$((total + 1))
  set +e
  bash scripts/verifier-versions-migrations.sh "$dossier" > "$bac/sortie.log" 2>&1
  local obtenu=$?
  set -e
  if [ "$obtenu" = "$attendu" ]; then
    passed=$((passed + 1))
    echo "ok - $nom"
  else
    echo "FAIL - $nom (code $obtenu, attendu $attendu)"
    sed 's/^/    /' "$bac/sortie.log"
  fi
}

cas 'le dossier du depot ne contient aucun nouveau doublon' 0 supabase/migrations

mkdir -p "$bac/propre"
touch "$bac/propre/20990101000000_a.sql" "$bac/propre/20990101000100_b.sql"
cas 'temoin: deux versions distinctes passent' 0 "$bac/propre"

mkdir -p "$bac/doublon"
touch "$bac/doublon/20990101000000_a.sql" "$bac/doublon/20990101000000_b.sql"
cas 'deux fichiers de meme version sont refuses' 1 "$bac/doublon"

mkdir -p "$bac/exception"
touch "$bac/exception/20261107160000_numerotation_commandes_non_reutilisable.sql" \
  "$bac/exception/20261107160000_rls_roles_ecritures_lot3.sql"
cas 'l exception documentee (deux noms exacts) reste acceptee' 0 "$bac/exception"

touch "$bac/exception/20990101000000_c.sql" "$bac/exception/20990101000000_d.sql"
cas 'une nouvelle collision a cote de l exception est refusee' 1 "$bac/exception"
rm "$bac/exception/20990101000000_c.sql" "$bac/exception/20990101000000_d.sql"

touch "$bac/exception/20261107160000_troisieme.sql"
cas 'un troisieme fichier de la version exceptee est refuse' 1 "$bac/exception"

mkdir -p "$bac/autre-nom"
touch "$bac/autre-nom/20261107160000_a.sql" "$bac/autre-nom/20261107160000_b.sql"
cas 'la version exceptee avec d autres noms est refusee' 1 "$bac/autre-nom"

cas 'dossier absent: erreur explicite' 2 "$bac/absent"

echo "versions-migrations-test: $passed/$total passed"
[ "$passed" = "$total" ]
