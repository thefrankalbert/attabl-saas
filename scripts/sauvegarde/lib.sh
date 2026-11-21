#!/usr/bin/env bash
# Fonctions pures (sans base) de la sauvegarde, testees par
# scripts/__tests__/sauvegarde-comptages.test.sh.

# Lit sur stdin la sortie de `pg_restore --data-only -f -` et ecrit
# "schema.table N" pour chaque bloc COPY. En format COPY texte, un saut de
# ligne dans une valeur est echappe (\n): une ligne = une rangee, donc le
# compte vient de la sauvegarde elle-meme, dans son propre instantane, sans
# course avec la base vivante.
comptages_depuis_copy() {
  awk '
    /^COPY [^ ]+ / { table = $2; gsub(/"/, "", table); n = 0; dedans = 1; next }
    dedans && $0 == "\\." { print table, n; dedans = 0; next }
    dedans { n++ }
  ' | sort
}

# comparer_comptages ATTENDU OBTENU: les deux fichiers "schema.table N".
# Sortie 0 seulement si chaque table attendue existe dans OBTENU avec
# exactement le meme nombre. Un fichier attendu vide est un echec: une
# sauvegarde sans aucune donnee ne prouve rien.
comparer_comptages() {
  local attendu=$1 obtenu=$2 ecarts=0 table n m
  if [ ! -s "$attendu" ]; then
    echo "ECART: aucune table attendue (sauvegarde vide ?)"
    return 1
  fi
  while read -r table n; do
    m=$(awk -v t="$table" '$1 == t { print $2 }' "$obtenu")
    if [ "$m" != "$n" ]; then
      echo "ECART: $table attendu=$n obtenu=${m:-absente}"
      ecarts=$((ecarts + 1))
    fi
  done < "$attendu"
  [ "$ecarts" -eq 0 ]
}
