#!/usr/bin/env bash
#
# Applique les DEUX migrations du moteur de stock du 2026-11-08.
#
# ------------------------------------------------------------------------------
# POURQUOI CE SCRIPT, ET PAS `supabase db push`
# ------------------------------------------------------------------------------
# L'historique des migrations de ce depot a deux systemes de nommage qui ont
# diverge: des dizaines de versions existent en base sans fichier local, et
# autant de fichiers locaux sans ligne en base. `supabase db push` voudrait donc
# rejouer des fichiers dont le contenu est DEJA en base sous un autre nom, et la
# reparation que le CLI suggere (`migration repair --status reverted`) EFFACERAIT
# ces lignes d'historique. Ne JAMAIS la lancer ici.
#
# Modele: `scripts/appliquer-rls-lot-20261108.sh`.
#
# ------------------------------------------------------------------------------
# CE QUE CES DEUX MIGRATIONS FONT
# ------------------------------------------------------------------------------
#   20261108160000  une seule regle de disponibilite des plats
#                   (public.sync_menu_availability), appelee par destock_order,
#                   restock_order, record_loss_tx, adjust_ingredient_stock_tx,
#                   commit_stock_count; et set_recipe_tx recalcule le plat edite.
#   20261108161000  get_stock_movements_page renvoie le NUMERO de la commande
#                   d'origine (jointure impossible cote client: reference_id n'a
#                   pas de cle etrangere).
#
# CE LOT NE RETIRE AUCUN ACCES. C'est son interet pour l'ordre de deploiement:
#   - les corps de fonction sont remplaces en place, les signatures d'appel de
#     l'application ne changent pas;
#   - la seule signature qui change est celle de get_stock_movements_page, qui
#     gagne une colonne en SORTIE. L'ancien code la lit via un enregistrement non
#     type et l'ignore; le nouveau code lit `order_number` et affiche un tiret
#     tant qu'elle est absente. Les deux ordres sont donc sans casse.
# La verification de deploiement est conservee quand meme (regle du depot), mais
# elle peut etre levee ici sans danger d'avoir coupe des ecritures.
#
# ------------------------------------------------------------------------------
# PIEGE QUE CE SCRIPT EVITE: le droit EXECUTE rendu a `anon`
# ------------------------------------------------------------------------------
# 20261108161000 doit SUPPRIMER puis recreer get_stock_movements_page (sa
# signature de retour change, donc CREATE OR REPLACE est impossible: 42P13).
# Or ce projet porte `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO
# anon` (mesure le 2026-11-08 dans pg_default_acl, pour postgres ET
# supabase_admin): une fonction FRAICHEMENT creee recoit donc un EXECUTE
# EXPLICITE pour `anon`, et `REVOKE ... FROM PUBLIC` ne retire PAS un droit
# accorde nommement a un role. La migration revoque donc explicitement `anon`, et
# ce script le VERIFIE apres coup au lieu de l'esperer.
#
# ------------------------------------------------------------------------------
# USAGE
# ------------------------------------------------------------------------------
#   bash scripts/appliquer-stock-20261108.sh --verifier   # ne modifie RIEN
#   bash scripts/appliquer-stock-20261108.sh --confirmer  # applique
#
#   [--sans-verification-deploiement]  (a justifier)
#   [--env-file <chemin>]   defaut .env.local; sinon $DATABASE_URL exporte
#   [--commit <sha>]        commit attendu sur le domaine (defaut origin/main)
#   [--sauvegarde <chemin>] fichier de sauvegarde a exiger
# ------------------------------------------------------------------------------
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

MODE=""
VERIF_DEPLOIEMENT="oui"
FICHIER_ENV=".env.local"
SHA_ATTENDU=""
CHEMIN_SAUVEGARDE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --verifier)  MODE="verifier" ;;
    --confirmer) MODE="appliquer" ;;
    --sans-verification-deploiement) VERIF_DEPLOIEMENT="non" ;;
    --env-file)   shift; FICHIER_ENV="${1:-}" ;;
    --commit)     shift; SHA_ATTENDU="${1:-}" ;;
    --sauvegarde) shift; CHEMIN_SAUVEGARDE="${1:-}" ;;
    *) echo "Argument inconnu: $1" >&2; MODE=""; break ;;
  esac
  shift || true
done
if [ -z "$MODE" ]; then
  echo "Usage: bash scripts/appliquer-stock-20261108.sh --verifier | --confirmer" >&2
  exit 2
fi

MIGRATIONS=(
  "supabase/migrations/20261108160000_menu_availability_sync.sql"
  "supabase/migrations/20261108161000_stock_history_order_number.sql"
)
for f in "${MIGRATIONS[@]}"; do
  [ -s "$f" ] || { echo "ERREUR: migration introuvable ou vide: $f" >&2; exit 2; }
done

# On NE source PAS le fichier d'environnement: il contient des valeurs non
# quotees. On extrait la seule ligne utile.
extract_env() {
  [ -f "$FICHIER_ENV" ] || return 0
  sed -n "s/^$1=//p" "$FICHIER_ENV" | head -1 | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//'
}

if [ ! -f "$FICHIER_ENV" ] && [ -z "${DATABASE_URL:-}" ]; then
  echo "ERREUR: ni fichier d'environnement ($FICHIER_ENV) ni \$DATABASE_URL." >&2
  exit 2
fi

PSQL="psql"
command -v "$PSQL" >/dev/null 2>&1 || { echo "ERREUR: psql introuvable." >&2; exit 2; }

CONN=""
ERRLOG="$(mktemp)"
for candidate in "${DATABASE_URL:-}" "$(extract_env DATABASE_URL)" "$(extract_env DATABASE_URL_POOLED)"; do
  [ -z "$candidate" ] && continue
  if "$PSQL" "$candidate" -t -c "select 1;" >/dev/null 2>>"$ERRLOG"; then CONN="$candidate"; break; fi
done
if [ -z "$CONN" ]; then
  echo "ECHEC DE CONNEXION. Message exact renvoye par la base:" >&2
  tail -3 "$ERRLOG" | sed 's/^/  /' >&2
  rm -f "$ERRLOG"; exit 3
fi
rm -f "$ERRLOG"

HOTE="$(printf '%s' "$CONN" | sed -E 's#.*@([^:/?]+).*#\1#')"
case "$HOTE" in
  *@*|*:*|*/*|"$CONN") echo "Base: (hote masque)" ;;
  *) echo "Base: $HOTE" ;;
esac
echo

# ------------------------------------------------------------------------------
# L'etat observe, pas l'etat suppose.
#
# On juge par EXISTENCE et par EGALITE STRICTE, jamais par un motif: une
# comparaison avec un motif sur une extraction vide repond "tout va bien"
# instantanement et a tort (lecon du 2026-11-07).
#
#   fonction_regle     1 des que sync_menu_availability existe (rien d'autre
#                      dans le depot ne la cree)
#   colonne_commande   1 si 'order_number' figure STRICTEMENT dans les noms de
#                      sortie de get_stock_movements_page (appartenance au
#                      tableau proargnames, pas un LIKE sur le texte)
#   anon_execute       0 exige: la cle anonyme ne doit PAS pouvoir executer la
#                      RPC recreee (c'est le piege des droits par defaut)
#   authenticated_exec 1 exige: l'ecran historique est lu par un membre du
#                      tenant, donc l'ACL d'origine doit avoir ete rendue
# ------------------------------------------------------------------------------
ETAT_SQL="
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'sync_menu_availability')
     as fonction_regle,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_stock_movements_page'
       and 'order_number' = any(p.proargnames)) as colonne_commande,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_stock_movements_page'
       and has_function_privilege('anon', p.oid, 'EXECUTE')) as anon_execute,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_stock_movements_page'
       and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
     as authenticated_execute
"
ATTENDU="fonction_regle=1 colonne_commande=1 anon_execute=0 authenticated_execute=1"

afficher_etat() {
  echo "--- Etat de la base ---"
  "$PSQL" "$CONN" -X -q -v ON_ERROR_STOP=1 -c "$ETAT_SQL"
  echo "Attendu une fois applique: $ATTENDU"
  echo
}

lire_compteurs() {
  "$PSQL" "$CONN" -X -q -t -A -F'|' -v ON_ERROR_STOP=1 -c "$ETAT_SQL" | tr -d '[:space:]'
}

echo "===== AVANT ====="
afficher_etat

IFS='|' read -r C_REGLE C_COL C_ANON C_AUTH <<< "$(lire_compteurs)"
if [ "$C_REGLE" = "1" ] && [ "$C_COL" = "1" ] && [ "$C_ANON" = "0" ] && [ "$C_AUTH" = "1" ]; then
  echo "stock: OK - deja applique ($ATTENDU). Rien a faire."
  exit 0
fi

if [ "$MODE" = "verifier" ]; then
  echo "Mode verification: RIEN n'a ete modifie."
  echo "stock: EN-ATTENTE"
  exit 0
fi

# ------------------------------------------------------------------------------
# GARDE-FOU 1: le code deploye. Ce lot ne retire aucun acces (voir l'en-tete),
# mais la regle du depot est de verifier plutot que de supposer.
# ------------------------------------------------------------------------------
if [ "$VERIF_DEPLOIEMENT" = "oui" ]; then
  echo "===== Verification du deploiement ====="
  SERVI="$(curl -fsS "https://attabl.com/api/version?cb=$(date +%s)" 2>/dev/null \
            | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  if [ -n "$SHA_ATTENDU" ]; then ATTENDU_SHA="$SHA_ATTENDU"
  else ATTENDU_SHA="$(git rev-parse origin/main 2>/dev/null)"; fi

  if [ -z "$SERVI" ] || [ -z "$ATTENDU_SHA" ]; then
    echo "ERREUR: impossible de comparer le commit servi et celui attendu." >&2
    echo "  servi='$SERVI'  attendu='$ATTENDU_SHA'" >&2
    exit 5
  fi
  # Egalite STRICTE, jamais un motif.
  if [ "$SERVI" != "$ATTENDU_SHA" ]; then
    echo "REFUS: le domaine ne sert pas encore le commit attendu." >&2
    echo "  servi   = $SERVI" >&2
    echo "  attendu = $ATTENDU_SHA" >&2
    echo "Si le merge est recent, ATTENDEZ ~3 min: le build tourne encore." >&2
    exit 5
  fi
  echo "Code deploye et servi: $SERVI"
  echo
fi

# ------------------------------------------------------------------------------
# GARDE-FOU 2: une sauvegarde doit exister.
# ------------------------------------------------------------------------------
echo "===== Verification de la sauvegarde ====="
if [ -n "$CHEMIN_SAUVEGARDE" ]; then DERNIERE_SAUVEGARDE="$CHEMIN_SAUVEGARDE"
else DERNIERE_SAUVEGARDE="$(ls -t supabase/backups/*.sql 2>/dev/null | head -1)"; fi
if [ -z "$DERNIERE_SAUVEGARDE" ] || [ ! -s "$DERNIERE_SAUVEGARDE" ]; then
  echo "REFUS: aucune sauvegarde utilisable." >&2
  echo "  cherchee: ${CHEMIN_SAUVEGARDE:-supabase/backups/*.sql}" >&2
  echo "Un worktree n'a pas supabase/backups/: pointez le fichier avec --sauvegarde." >&2
  exit 6
fi
echo "Sauvegarde: $DERNIERE_SAUVEGARDE"
ls -l "$DERNIERE_SAUVEGARDE" | awk '{print "  taille: "$5" octets, date: "$6" "$7" "$8}'
AGE_JOURS=$(( ( $(date +%s) - $(stat -f %m "$DERNIERE_SAUVEGARDE" 2>/dev/null || echo 0) ) / 86400 ))
if [ "$AGE_JOURS" -gt 0 ]; then
  echo "  ATTENTION: cette sauvegarde a $AGE_JOURS jour(s)."
fi
echo

# ------------------------------------------------------------------------------
# L'application: les deux fichiers dans UNE SEULE transaction.
# ------------------------------------------------------------------------------
LOT="$(mktemp)"
trap 'rm -f "$LOT"' EXIT
: > "$LOT"
for f in "${MIGRATIONS[@]}"; do
  printf '\n-- ===== %s =====\n' "$f" >> "$LOT"
  cat "$f" >> "$LOT"
done

echo "===== APPLICATION (une transaction, les deux fichiers) ====="
if ! "$PSQL" "$CONN" -X -q -1 -v ON_ERROR_STOP=1 -f "$LOT"; then
  echo >&2
  echo "ECHEC: la transaction a ete annulee EN ENTIER. La base est inchangee." >&2
  echo "Sauvegarde disponible: $DERNIERE_SAUVEGARDE" >&2
  exit 4
fi
echo "Transaction validee."
echo

echo "===== Enregistrement dans l'historique des migrations ====="
if "$PSQL" "$CONN" -X -q -v ON_ERROR_STOP=1 -c "
  insert into supabase_migrations.schema_migrations (version)
  values ('20261108160000'), ('20261108161000')
  on conflict (version) do nothing;" 2>/dev/null; then
  echo "Les deux versions sont enregistrees."
else
  echo "AVERTISSEMENT: l'enregistrement a echoue (les fonctions, elles, SONT posees)."
fi
echo

echo "===== APRES ====="
afficher_etat
IFS='|' read -r C_REGLE C_COL C_ANON C_AUTH <<< "$(lire_compteurs)"
if [ "$C_REGLE" = "1" ] && [ "$C_COL" = "1" ] && [ "$C_ANON" = "0" ] && [ "$C_AUTH" = "1" ]; then
  echo "stock: APPLIQUE"
  exit 0
fi
echo "stock: ETAT-INATTENDU (lu: fonction_regle=$C_REGLE colonne_commande=$C_COL anon_execute=$C_ANON authenticated_execute=$C_AUTH)" >&2
exit 7
