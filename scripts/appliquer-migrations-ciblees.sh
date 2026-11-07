#!/usr/bin/env bash
#
# Applique UNE OU PLUSIEURS migrations nommees, et rien d'autre.
#
# POURQUOI CE SCRIPT EXISTE. Sur ce depot, `scripts/db-migrate.sh --target
# production --confirm` prend la sauvegarde puis REFUSE d'appliquer:
#
#   Remote migration versions not found in local migrations directory.
#
# Cause mesuree le 2026-11-07 sur `supabase migration list`: l'historique a deux
# systemes de nommage qui ont diverge. 47 versions existent en base sans fichier
# local (horodatages a la seconde, migrations passees par le tableau de bord ou
# le MCP), et une quarantaine de fichiers locaux n'ont aucune ligne en base (les
# memes changements, renommes dans le depot).
#
# `supabase db push` ne sait donc pas appliquer "juste la derniere": il voudrait
# rejouer les quarante fichiers locaux non suivis, dont le contenu est deja en
# base sous un autre nom. Et la reparation que le CLI suggere
# (`migration repair --status reverted`) effacerait les 47 lignes d'historique,
# ce qui aggraverait exactement ce probleme.
#
# Ce script fait donc ce que `db push` ne peut pas faire: appliquer les fichiers
# NOMMES, dans UNE transaction, puis les enregistrer dans l'historique.
#
# CE QU'IL NE FAIT PAS, volontairement:
#   - il ne prend PAS de sauvegarde. Lancer `db-migrate.sh --target production
#     --confirm` d'abord: il sauvegarde le schema avant de refuser, et c'est
#     cette sauvegarde qui sert de filet (et de copie pour repeter en local).
#   - il ne verifie PAS le resultat metier. Chaque migration a sa propre preuve
#     (test pgTAP, ou une requete d'etat). La verifier fait partie de la tache,
#     pas de cet outil.
#
# AVANT DE L'UTILISER SUR LA PRODUCTION: repeter sur une copie. Restaurer la
# sauvegarde du schema dans un Postgres jetable, jouer la migration, jouer sa
# preuve, et verifier qu'elle est ROUGE avant et VERTE apres. La procedure
# complete est en tete de
# supabase/tests/rls/verification-ecritures-roles-sans-pgtap.sql.
#
# Usage:
#   bash scripts/appliquer-migrations-ciblees.sh --confirmer <fichier.sql> [...]
#   bash scripts/appliquer-migrations-ciblees.sh --montrer   <fichier.sql> [...]
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

MODE=""
case "${1:-}" in
  --montrer)   MODE="montrer"; shift ;;
  --confirmer) MODE="appliquer"; shift ;;
  *) echo "Usage: bash scripts/appliquer-migrations-ciblees.sh --confirmer|--montrer <fichier.sql> [...]" >&2; exit 2 ;;
esac

[ $# -gt 0 ] || { echo "ERREUR: donner au moins un fichier de migration." >&2; exit 2; }

VERSIONS=()
for f in "$@"; do
  [ -s "$f" ] || { echo "ERREUR: fichier introuvable ou vide: $f" >&2; exit 2; }
  base="$(basename "$f")"
  # Le nom DOIT porter l'horodatage, sinon on ne saurait pas quoi enregistrer
  # dans l'historique - et une migration appliquee mais non enregistree
  # reapparaitrait "en attente" a chaque inspection.
  case "$base" in
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_*.sql) ;;
    *) echo "ERREUR: nom inattendu ($base). Attendu: <14 chiffres>_nom.sql" >&2; exit 2 ;;
  esac
  VERSIONS+=("${base%%_*}")
done

[ -f .env.local ] || { echo "ERREUR: .env.local introuvable a la racine du projet." >&2; exit 2; }
# On NE source PAS .env.local: il contient des valeurs non quotees (un `<` dans
# une adresse e-mail suffit a casser le shell). On extrait la seule ligne utile.
extract_env() {
  sed -n "s/^$1=//p" .env.local | head -1 | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//'
}

command -v psql >/dev/null 2>&1 || { echo "ERREUR: psql introuvable." >&2; exit 2; }

CONN=""
ERRLOG="$(mktemp)"
for candidate in "$(extract_env DATABASE_URL)" "$(extract_env DATABASE_URL_POOLED)"; do
  [ -z "$candidate" ] && continue
  if psql "$candidate" -t -c "select 1;" >/dev/null 2>>"$ERRLOG"; then CONN="$candidate"; break; fi
done
if [ -z "$CONN" ]; then
  echo "ECHEC DE CONNEXION. Message exact renvoye par la base:" >&2
  tail -3 "$ERRLOG" | sed 's/^/  /' >&2
  rm -f "$ERRLOG"; exit 3
fi
rm -f "$ERRLOG"

# Masque fail-closed: si l'extraction de l'hote ne donne pas un nom d'hote
# plausible, on n'affiche RIEN plutot que de risquer d'imprimer l'URL complete,
# mot de passe compris.
HOTE="$(printf '%s' "$CONN" | sed -E 's#.*@([^:/?]+).*#\1#')"
case "$HOTE" in
  *@*|*:*|*/*|"$CONN") echo "Base: (hote masque)" ;;
  *) echo "Base: $HOTE" ;;
esac
echo "Fichiers: $*"
echo "Versions a enregistrer: ${VERSIONS[*]}"
echo

echo "=== Deja enregistrees dans l'historique ? ==="
LISTE="$(printf "'%s'," "${VERSIONS[@]}")"; LISTE="${LISTE%,}"
psql "$CONN" -X -q -c "
  select version, 'deja enregistree' as etat
    from supabase_migrations.schema_migrations
   where version in ($LISTE)
   order by version;" 2>/dev/null || echo "(historique illisible, on continue)"
echo

if [ "$MODE" = "montrer" ]; then
  echo "Mode montrer: RIEN n'a ete applique."
  exit 0
fi

LOT="$(mktemp)"
trap 'rm -f "$LOT"' EXIT
cat "$@" > "$LOT"

echo "=== Application (une transaction, tous les fichiers) ==="
if ! psql "$CONN" -X -q -1 -v ON_ERROR_STOP=1 -f "$LOT"; then
  echo >&2
  echo "ECHEC: la transaction a ete annulee en entier. La base est inchangee." >&2
  exit 4
fi
echo "Transaction validee."
echo

# L'enregistrement est de la COMPTABILITE, pas de la securite: s'il echoue, la
# migration est deja appliquee. On le signale sans rien annuler.
echo "=== Enregistrement dans l'historique ==="
VALEURS="$(printf "('%s')," "${VERSIONS[@]}")"; VALEURS="${VALEURS%,}"
if psql "$CONN" -X -q -v ON_ERROR_STOP=1 -c "
  insert into supabase_migrations.schema_migrations (version)
  values $VALEURS
  on conflict (version) do nothing;" 2>/dev/null; then
  echo "Versions enregistrees: ${VERSIONS[*]}"
else
  echo "AVERTISSEMENT: l'enregistrement a echoue (la migration, elle, EST appliquee)."
  echo "Sans consequence: seul \`supabase migration list\` la reverra en attente."
fi
echo
echo "migrations: APPLIQUEES - verifie maintenant la preuve propre a chaque migration."
