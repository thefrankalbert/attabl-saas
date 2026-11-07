#!/usr/bin/env bash
#
# Applique UNIQUEMENT les deux migrations RLS du 2026-11-07 a la base.
#
# POURQUOI CE SCRIPT EXISTE, et pourquoi `db-migrate.sh` ne suffit pas.
#
# Le 2026-11-07, `scripts/db-migrate.sh --target production --confirm` a pris la
# sauvegarde puis a REFUSE d'appliquer, avec ce message:
#
#   Remote migration versions not found in local migrations directory.
#
# La cause, mesuree sur la sortie de `supabase migration list`: l'historique des
# migrations de ce depot a DEUX systemes de nommage qui ont diverge. 47 versions
# existent en base sans fichier local (horodatages a la seconde, du type
# 20260629105902: ce sont des migrations appliquees via le tableau de bord ou le
# MCP), et une quarantaine de fichiers locaux n'ont aucune ligne en base (du type
# 20260629000000: les memes changements, renommes a la main dans le depot).
#
# Consequence, et c'est le piege a eviter: `supabase db push` ne sait pas appliquer
# "juste les deux dernieres". Il voudrait rejouer les quarante fichiers locaux
# non suivis - dont le contenu est DEJA en base sous un autre nom. Et la reparation
# que le CLI suggere (`migration repair --status reverted ...`) effacerait les 47
# lignes de l'historique, ce qui aggraverait exactement ce probleme.
#
# Donc on applique les deux fichiers du jour DIRECTEMENT, dans UNE transaction, et
# on les enregistre ensuite dans l'historique. Rien d'autre n'est touche.
#
# CES DEUX FICHIERS NE SONT PAS REJOUABLES, et c'est mesure, pas suppose. Les
# `DROP POLICY IF EXISTS` visent les ANCIENS noms, pas les nouveaux: un second
# passage echoue sur `policy "..." already exists`. Comme tout est dans UNE
# transaction, l'echec annule tout et la base reste correcte - mais le message
# fait peur pour rien. Ce script verifie donc l'etat AVANT et s'arrete en disant
# "deja applique" plutot que de rejouer.
#
# Usage:
#   bash scripts/appliquer-rls-20261107.sh --verifier   # ne modifie RIEN, montre l'etat
#   bash scripts/appliquer-rls-20261107.sh --confirmer  # applique
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

MODE=""
case "${1:-}" in
  --verifier)  MODE="verifier" ;;
  --confirmer) MODE="appliquer" ;;
  *) echo "Usage: bash scripts/appliquer-rls-20261107.sh --verifier | --confirmer" >&2; exit 2 ;;
esac

CATALOGUE="supabase/migrations/20261107100000_rls_roles_ecritures_catalogue.sql"
ARGENT="supabase/migrations/20261107120000_rls_roles_ecritures_argent.sql"
for f in "$CATALOGUE" "$ARGENT"; do
  [ -s "$f" ] || { echo "ERREUR: fichier de migration introuvable ou vide: $f" >&2; exit 2; }
done

# On NE source PAS .env.local: il contient des valeurs non quotees (un `<` dans une
# adresse e-mail suffit a casser le shell). On extrait la seule ligne utile.
extract_env() {
  sed -n "s/^$1=//p" .env.local | head -1 | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//'
}
[ -f .env.local ] || { echo "ERREUR: .env.local introuvable a la racine du projet." >&2; exit 2; }

PSQL="psql"
command -v "$PSQL" >/dev/null 2>&1 || { echo "ERREUR: psql introuvable." >&2; exit 2; }

CONN=""
ERRLOG="$(mktemp)"
for candidate in "$(extract_env DATABASE_URL)" "$(extract_env DATABASE_URL_POOLED)"; do
  [ -z "$candidate" ] && continue
  if "$PSQL" "$candidate" -t -c "select 1;" >/dev/null 2>>"$ERRLOG"; then CONN="$candidate"; break; fi
done
if [ -z "$CONN" ]; then
  echo "ECHEC DE CONNEXION. Message exact renvoye par la base:" >&2
  tail -3 "$ERRLOG" | sed 's/^/  /' >&2
  rm -f "$ERRLOG"; exit 3
fi
rm -f "$ERRLOG"
# Le masque est fail-closed: si l'extraction de l'hote ne donne pas quelque chose
# qui ressemble a un nom d'hote, on n'affiche RIEN plutot que de risquer
# d'imprimer l'URL complete, mot de passe compris.
HOTE="$(printf '%s' "$CONN" | sed -E 's#.*@([^:/?]+).*#\1#')"
case "$HOTE" in
  *@*|*:*|*/*|"$CONN") echo "Base: (hote masque)" ;;
  *) echo "Base: $HOTE" ;;
esac
echo

# --------------------------------------------------------------------------
# L'etat observe, pas l'etat suppose.
#
# On juge sur l'EXISTENCE des policies, par egalite STRICTE de leur nom - jamais
# par un motif. Une comparaison avec un motif sur une extraction vide repond
# "tout va bien" instantanement et a tort (lecon du 2026-11-07).
# --------------------------------------------------------------------------
ETAT_SQL="
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'has_tenant_write_permission') as fonction_garde,
  (select count(*) from pg_policies where schemaname = 'public' and policyname in (
     'Admins can manage own tenant menu items',
     'Admins can manage own tenant categories',
     'Admins can manage own tenant menus',
     'Admins can manage tables',
     'Admins can manage own tenant orders',
     'Admins can delete their restaurant orders',
     'Admins can manage their restaurant orders',
     'Admins can insert own tenant order items',
     'Admins can update own tenant order items',
     'Admins can delete own tenant order items',
     'Admins can update own tenant')) as anciennes_permissives,
  (select count(*) from pg_policies where schemaname = 'public' and policyname in (
     'Members can read own tenant menu items',
     'Menu managers can update own tenant menu items',
     'Menu managers can delete own tenant menu items',
     'Members can read own tenant categories',
     'Menu managers can update own tenant categories',
     'Menu managers can delete own tenant categories',
     'Members can read own tenant menus',
     'Menu managers can insert own tenant menus',
     'Menu managers can update own tenant menus',
     'Menu managers can delete own tenant menus',
     'Members can read own tenant tables',
     'Table managers can insert own tenant tables',
     'Table managers can update own tenant tables',
     'Table managers can delete own tenant tables',
     'Order managers can insert own tenant orders',
     'Order managers can update own tenant orders',
     'Order managers can delete own tenant orders',
     'Order managers can insert own tenant order items',
     'Order managers can update own tenant order items',
     'Order managers can delete own tenant order items',
     'Settings managers can update own tenant')) as nouvelles_posees,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename = 'payments' and policyname = 'payments_tenant_insert'
     and with_check like '%has_tenant_write_permission%') as payments_resserre
"

afficher_etat() {
  echo "--- Etat de la base ---"
  "$PSQL" "$CONN" -X -q -v ON_ERROR_STOP=1 -c "$ETAT_SQL"
  echo "Attendu une fois applique:  fonction_garde=1 | anciennes_permissives=0 | nouvelles_posees=21 | payments_resserre=1"
  echo
}

# Les quatre compteurs en UNE seule requete, separes par des barres verticales.
lire_compteurs() {
  "$PSQL" "$CONN" -X -q -t -A -F'|' -v ON_ERROR_STOP=1 -c "$ETAT_SQL" | tr -d '[:space:]'
}

echo "===== AVANT ====="
afficher_etat

if [ "$MODE" = "verifier" ]; then
  echo "Mode verification: RIEN n'a ete modifie."
  exit 0
fi

# Deja applique ? On s'arrete ici. Rejouer les fichiers echouerait sur les noms
# des nouvelles policies (voir l'explication en tete de fichier).
IFS='|' read -r F0 A0 N0 P0 <<< "$(lire_compteurs)"
if [ "$F0" = "1" ] && [ "$A0" = "0" ] && [ "$N0" = "21" ] && [ "$P0" = "1" ]; then
  echo "rls: OK - deja applique (fonction=1 anciennes=0 nouvelles=21 payments=1). Rien a faire."
  exit 0
fi

# --------------------------------------------------------------------------
# L'application: les deux fichiers dans UNE SEULE transaction.
# `-1` ouvre la transaction, ON_ERROR_STOP la fait echouer en entier a la
# premiere erreur. Soit les deux migrations passent, soit aucune.
# --------------------------------------------------------------------------
LOT="$(mktemp)"
trap 'rm -f "$LOT"' EXIT
cat "$CATALOGUE" "$ARGENT" > "$LOT"

echo "===== APPLICATION (une transaction, les deux fichiers) ====="
if ! "$PSQL" "$CONN" -X -q -1 -v ON_ERROR_STOP=1 -f "$LOT"; then
  echo >&2
  echo "ECHEC: la transaction a ete annulee en entier. La base est inchangee." >&2
  echo "La sauvegarde du schema prise par db-migrate.sh est dans supabase/backups/." >&2
  exit 4
fi
echo "Transaction validee."
echo

# L'enregistrement dans l'historique est de la COMPTABILITE, pas de la securite.
# S'il echoue, les policies sont deja posees: on le signale sans tout annuler.
echo "===== Enregistrement dans l'historique des migrations ====="
if "$PSQL" "$CONN" -X -q -v ON_ERROR_STOP=1 -c "
  insert into supabase_migrations.schema_migrations (version)
  values ('20261107100000'), ('20261107120000')
  on conflict (version) do nothing;" 2>/dev/null; then
  echo "Les deux versions sont enregistrees."
else
  echo "AVERTISSEMENT: l'enregistrement a echoue (les policies, elles, SONT posees)."
  echo "Sans consequence sur la securite: seul \`supabase migration list\` les reverra en attente."
fi
echo

echo "===== APRES ====="
afficher_etat

# `payments_tenant_insert` porte le MEME nom avant et apres: son existence ne
# prouve rien. On verifie que sa condition appelle bien la fonction de garde.
IFS='|' read -r FONCTION ANCIENNES NOUVELLES PAYMENTS <<< "$(lire_compteurs)"

# Egalite stricte sur les trois compteurs. Pas de motif, pas de "au moins".
if [ "$FONCTION" = "1" ] && [ "$ANCIENNES" = "0" ] && [ "$NOUVELLES" = "21" ] && [ "$PAYMENTS" = "1" ]; then
  echo "rls: OK - fonction=1 anciennes=0 nouvelles=21 payments=1"
  exit 0
fi
echo "rls: ECHEC - fonction=$FONCTION (attendu 1) anciennes=$ANCIENNES (attendu 0) nouvelles=$NOUVELLES (attendu 21) payments=$PAYMENTS (attendu 1)" >&2
exit 5
