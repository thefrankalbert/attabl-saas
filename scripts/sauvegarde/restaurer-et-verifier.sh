#!/usr/bin/env bash
# Restaure out/prod.dump dans la base jetable TARGET_URL puis prouve que
# chaque rangee sauvegardee est bien revenue. Appele par sauvegarde.yml.
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=scripts/sauvegarde/lib.sh
. scripts/sauvegarde/lib.sh

: "${TARGET_URL:?TARGET_URL absent}"
: "${PG_IMAGE:?PG_IMAGE absent}"
test -s out/prod.dump

pg() {
  docker run --rm --network "${PG_NETWORK:-host}" -e TARGET_URL -v "$PWD/out:/out" "$PG_IMAGE" "$@"
}

# 1. Ce que la sauvegarde contient, compte depuis le fichier lui-meme.
pg pg_restore --data-only --file=- /out/prod.dump | comptages_depuis_copy > out/attendu.txt
# Les regles RLS comptent autant que les donnees: une base restauree sans
# elles exposerait chaque restaurant a tous les autres.
echo "rls.politiques_public $(pg pg_restore --list /out/prod.dump | grep -c ' POLICY public ')" >> out/attendu.txt
echo "tables avec donnees dans la sauvegarde: $(($(wc -l < out/attendu.txt) - 1))"

# 2. L'image Supabase cree deja un schema auth d'une ancienne version
#    (auth.users, auth.refresh_tokens...). Le garder ferait echouer le
#    chargement des comptes. On l'enleve: celui de la sauvegarde, a jour,
#    le remplace en entier.
pg sh -c 'psql "$TARGET_URL" -q -v ON_ERROR_STOP=1 -c "drop schema if exists auth cascade"'

# 3. Restauration. Des erreurs sont attendues sur les objets que l'image
#    Supabase cree deja (schemas systeme, extensions): elles sont comptees et
#    affichees, et c'est l'etape 4 qui juge, rangee par rangee.
set +e
pg sh -c 'pg_restore --no-owner --dbname="$TARGET_URL" /out/prod.dump' > out/restauration.log 2>&1
set -e
echo "avertissements de restauration: $(grep -c 'pg_restore: ' out/restauration.log || true)"

# 4. Recompte dans la base restauree, table par table.
: > out/obtenu.txt
while read -r table _; do
  [ "$table" = rls.politiques_public ] && continue
  n=$(pg sh -c "psql \"\$TARGET_URL\" -At -v ON_ERROR_STOP=1 -c 'select count(*) from $table'" 2>/dev/null || echo absente)
  echo "$table $n" >> out/obtenu.txt
done < out/attendu.txt
echo "rls.politiques_public $(pg sh -c "psql \"\$TARGET_URL\" -At -c \"select count(*) from pg_policies where schemaname = 'public'\"")" >> out/obtenu.txt

if comparer_comptages out/attendu.txt out/obtenu.txt > out/ecarts.txt; then
  tables=$(grep -vc '^rls\.' out/attendu.txt)
  lignes=$(grep -v '^rls\.' out/attendu.txt | awk '{ s += $2 } END { print s }')
  politiques=$(awk '$1 == "rls.politiques_public" { print $2 }' out/attendu.txt)
  echo "restauration: OK ($tables tables, $lignes rangees, $politiques regles RLS, tout est revenu)"
  echo "### Restauration verifiee: $tables tables, toutes les rangees et toutes les regles RLS retrouvees" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
else
  cat out/ecarts.txt
  grep 'pg_restore: ' out/restauration.log | head -40
  echo "restauration: FAIL"
  echo "### Restauration ECHOUEE: $(wc -l < out/ecarts.txt) table(s) incompletes" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  exit 1
fi
