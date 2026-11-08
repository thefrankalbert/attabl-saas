#!/usr/bin/env bash
#
# Applique les SIX migrations RLS en attente du lot du 2026-11-07/08.
#
# ------------------------------------------------------------------------------
# POURQUOI CE SCRIPT, ET PAS `supabase db push`
# ------------------------------------------------------------------------------
# L'historique des migrations de ce depot a DEUX systemes de nommage qui ont
# diverge: 47 versions existent en base sans fichier local, et une quarantaine de
# fichiers locaux n'ont aucune ligne en base. `supabase db push` voudrait donc
# rejouer une quarantaine de fichiers dont le contenu est DEJA en base sous un
# autre nom, et la reparation que le CLI suggere
# (`migration repair --status reverted`) EFFACERAIT les 47 lignes de l'historique,
# ce qui aggraverait exactement ce probleme. Ne JAMAIS la lancer ici.
#
# On applique donc les six fichiers DIRECTEMENT, dans UNE transaction, puis on les
# enregistre dans l'historique. Rien d'autre n'est touche.
#
# Modele: `scripts/appliquer-rls-20261107.sh`, qui a applique les deux premieres
# migrations du lot (20261107100000 et 20261107120000, deja en production).
#
# ------------------------------------------------------------------------------
# CE QUE CES SIX MIGRATIONS FONT, ET POURQUOI L'ORDRE DU DEPLOIEMENT COMPTE
# ------------------------------------------------------------------------------
#   20261107160000  lot 3: 20 tables passent a une garde par role
#   20261107170000  la garde honore les delegations du proprietaire
#   20261107180000  lot 4: item_options, stock_alert_notifications, table_sessions
#   20261107190000  l'argent ne se delegue pas avec les commandes
#   20261107200000  la garde argent regarde le statut, pas seulement le signe
#   20261107210000  la matrice de la base rejoint celle du produit + montants verrouilles
#
# Ce lot RETIRE des acces. La regle du depot est donc non negociable: le CODE doit
# etre deploye AVANT. Dans l'autre ordre, la base refuse des ecritures que le code
# en production fait encore, et des restaurants PAYANTS ne peuvent plus encaisser
# pendant l'intervalle.
#
# Ce script le VERIFIE au lieu de faire confiance: il compare le commit servi par
# https://attabl.com/api/version a `origin/main`, et refuse d'appliquer s'ils
# divergent. Le contournement existe (`--sans-verification-deploiement`) pour le
# cas ou la verification elle-meme est en panne, et il DOIT etre justifie.
#
# Piege connu, mesure le 2026-11-09: ne pas juger dans la minute qui suit un
# merge. Le domaine sert encore l'ancien commit tant que le build tourne (~3 min).
# Un ecart constate trop tot n'est PAS une panne de promotion.
#
# ------------------------------------------------------------------------------
# USAGE
# ------------------------------------------------------------------------------
#   bash scripts/appliquer-rls-lot-20261108.sh --verifier   # ne modifie RIEN
#   bash scripts/appliquer-rls-lot-20261108.sh --confirmer  # applique
#
#   Option: --sans-verification-deploiement  (a justifier, voir ci-dessus)
# ------------------------------------------------------------------------------
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

MODE=""
VERIF_DEPLOIEMENT="oui"
for arg in "$@"; do
  case "$arg" in
    --verifier)  MODE="verifier" ;;
    --confirmer) MODE="appliquer" ;;
    --sans-verification-deploiement) VERIF_DEPLOIEMENT="non" ;;
    *) echo "Argument inconnu: $arg" >&2; MODE=""; break ;;
  esac
done
if [ -z "$MODE" ]; then
  echo "Usage: bash scripts/appliquer-rls-lot-20261108.sh --verifier | --confirmer" >&2
  echo "       [--sans-verification-deploiement]" >&2
  exit 2
fi

MIGRATIONS=(
  "supabase/migrations/20261107160000_rls_roles_ecritures_lot3.sql"
  "supabase/migrations/20261107170000_garde_honore_delegation_explicite.sql"
  "supabase/migrations/20261107180000_rls_roles_ecritures_lot4_fin.sql"
  "supabase/migrations/20261107190000_garde_argent_non_delegable.sql"
  "supabase/migrations/20261107200000_garde_argent_statut_et_parite.sql"
  "supabase/migrations/20261107210000_matrice_defaut_et_montants_proteges.sql"
)
for f in "${MIGRATIONS[@]}"; do
  [ -s "$f" ] || { echo "ERREUR: migration introuvable ou vide: $f" >&2; exit 2; }
done

# On NE source PAS .env.local: il contient des valeurs non quotees (un `<` dans
# une adresse e-mail suffit a casser le shell). On extrait la seule ligne utile.
extract_env() {
  sed -n "s/^$1=//p" .env.local | head -1 | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//'
}
[ -f .env.local ] || { echo "ERREUR: .env.local introuvable a la racine." >&2; exit 2; }

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

# Masque fail-closed: si l'extraction de l'hote ne donne pas quelque chose qui
# ressemble a un nom d'hote, on n'affiche RIEN plutot que de risquer d'imprimer
# l'URL complete, mot de passe compris.
HOTE="$(printf '%s' "$CONN" | sed -E 's#.*@([^:/?]+).*#\1#')"
case "$HOTE" in
  *@*|*:*|*/*|"$CONN") echo "Base: (hote masque)" ;;
  *) echo "Base: $HOTE" ;;
esac
echo

# ------------------------------------------------------------------------------
# L'etat observe, pas l'etat suppose.
#
# On juge sur l'EXISTENCE d'objets, par egalite STRICTE de leur nom - jamais par
# un motif. Une comparaison avec un motif sur une extraction vide repond "tout va
# bien" instantanement et a tort (lecon du 2026-11-07).
#
# Les six fichiers s'appliquent dans UNE transaction: une application partielle
# est donc impossible. Verifier les artefacts de la DERNIERE migration suffit
# donc a savoir que le lot entier a bien atterri. On verifie en plus que les
# ANCIENS noms de policies ont disparu, ce qui attrape un etat a moitie pose
# venu d'ailleurs que ce script.
# ------------------------------------------------------------------------------
ETAT_SQL="
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'has_tenant_floor_permission')
     as fonction_salle,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'has_tenant_money_permission')
     as fonction_argent,
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'orders' and not t.tgisinternal
       and t.tgname = 'trg_montants_commande_non_reecrits') as declencheur_montants,
  (select count(*) from pg_constraint c join pg_class t on t.oid = c.conrelid
     where t.relname = 'orders' and c.conname = 'orders_montants_non_negatifs_check')
     as contrainte_montants,
  (select count(*) from pg_policies where schemaname = 'public' and policyname in (
     'Floor managers can insert own tenant zones',
     'Floor managers can update own tenant zones',
     'Floor managers can delete own tenant zones',
     'Floor managers can insert own tenant tables',
     'Floor managers can update own tenant tables',
     'Floor managers can delete own tenant tables',
     'Floor managers can insert own tenant assignments',
     'Floor managers can update own tenant assignments',
     'Floor managers can delete own tenant assignments')) as policies_salle,
  (select count(*) from pg_policies where schemaname = 'public' and policyname in (
     'Order managers can insert own tenant zones',
     'Order managers can update own tenant zones',
     'Order managers can delete own tenant zones',
     'Table managers can insert own tenant tables',
     'Table managers can update own tenant tables',
     'Table managers can delete own tenant tables',
     'Order managers can insert own tenant assignments',
     'Order managers can update own tenant assignments',
     'Order managers can delete own tenant assignments')) as anciennes_salle
"
ATTENDU="fonction_salle=1 fonction_argent=1 declencheur_montants=1 contrainte_montants=1 policies_salle=9 anciennes_salle=0"

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

# ------------------------------------------------------------------------------
# Deja applique ? On s'arrete. Parmi ces six fichiers, seul 20261107210000 est
# rejouable; les autres visent les ANCIENS noms de policies et echoueraient au
# second passage. L'echec annulerait tout (une seule transaction) et la base
# resterait correcte, mais le message ferait peur pour rien.
# ------------------------------------------------------------------------------
IFS='|' read -r C_SALLE C_ARGENT C_TRIG C_CONTR C_POL C_ANC <<< "$(lire_compteurs)"
if [ "$C_SALLE" = "1" ] && [ "$C_ARGENT" = "1" ] && [ "$C_TRIG" = "1" ] \
   && [ "$C_CONTR" = "1" ] && [ "$C_POL" = "9" ] && [ "$C_ANC" = "0" ]; then
  echo "rls: OK - deja applique ($ATTENDU). Rien a faire."
  exit 0
fi

if [ "$MODE" = "verifier" ]; then
  echo "Mode verification: RIEN n'a ete modifie."
  echo "rls: EN-ATTENTE"
  exit 0
fi

# ------------------------------------------------------------------------------
# GARDE-FOU 1: le code doit etre deploye AVANT un resserrage d'acces.
# ------------------------------------------------------------------------------
if [ "$VERIF_DEPLOIEMENT" = "oui" ]; then
  echo "===== Verification du deploiement ====="
  SERVI="$(curl -fsS "https://attabl.com/api/version?cb=$(date +%s)" 2>/dev/null \
            | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  ATTENDU_SHA="$(git rev-parse origin/main 2>/dev/null)"

  if [ -z "$SERVI" ] || [ -z "$ATTENDU_SHA" ]; then
    echo "ERREUR: impossible de comparer le commit servi et origin/main." >&2
    echo "  servi='$SERVI'  origin/main='$ATTENDU_SHA'" >&2
    echo "Relancez avec --sans-verification-deploiement SEULEMENT si vous avez" >&2
    echo "verifie autrement que le code est deploye." >&2
    exit 5
  fi

  # Egalite STRICTE, jamais un motif: une comparaison avec un motif sur une
  # extraction vide repondrait "a jour" a tort.
  if [ "$SERVI" != "$ATTENDU_SHA" ]; then
    echo "REFUS: le domaine ne sert pas encore origin/main." >&2
    echo "  servi      = $SERVI" >&2
    echo "  origin/main= $ATTENDU_SHA" >&2
    echo >&2
    echo "Ce lot RETIRE des acces. L'appliquer maintenant couperait des" >&2
    echo "ecritures que le code en production fait encore." >&2
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
DERNIERE_SAUVEGARDE="$(ls -t supabase/backups/*.sql 2>/dev/null | head -1)"
if [ -z "$DERNIERE_SAUVEGARDE" ]; then
  echo "REFUS: aucune sauvegarde dans supabase/backups/." >&2
  echo "Prenez-en une avant d'appliquer un resserrage d'acces." >&2
  exit 6
fi
echo "Derniere sauvegarde: $DERNIERE_SAUVEGARDE"
echo "  (verifiez sa date: une sauvegarde perimee ne protege de rien)"
ls -l "$DERNIERE_SAUVEGARDE" | awk '{print "  taille/date: "$5" octets, "$6" "$7" "$8}'
echo

# ------------------------------------------------------------------------------
# L'application: les six fichiers dans UNE SEULE transaction.
# `-1` ouvre la transaction, ON_ERROR_STOP la fait echouer en entier a la
# premiere erreur. Soit les six passent, soit aucune.
# ------------------------------------------------------------------------------
LOT="$(mktemp)"
trap 'rm -f "$LOT"' EXIT
: > "$LOT"
for f in "${MIGRATIONS[@]}"; do
  printf '\n-- ===== %s =====\n' "$f" >> "$LOT"
  cat "$f" >> "$LOT"
done

echo "===== APPLICATION (une transaction, les six fichiers) ====="
if ! "$PSQL" "$CONN" -X -q -1 -v ON_ERROR_STOP=1 -f "$LOT"; then
  echo >&2
  echo "ECHEC: la transaction a ete annulee EN ENTIER. La base est inchangee." >&2
  echo "Sauvegarde disponible: $DERNIERE_SAUVEGARDE" >&2
  exit 4
fi
echo "Transaction validee."
echo

# L'enregistrement dans l'historique est de la COMPTABILITE, pas de la securite.
# S'il echoue, les policies sont deja posees: on le signale sans tout annuler.
echo "===== Enregistrement dans l'historique des migrations ====="
if "$PSQL" "$CONN" -X -q -v ON_ERROR_STOP=1 -c "
  insert into supabase_migrations.schema_migrations (version)
  values ('20261107160000'), ('20261107170000'), ('20261107180000'),
         ('20261107190000'), ('20261107200000'), ('20261107210000')
  on conflict (version) do nothing;" 2>/dev/null; then
  echo "Les six versions sont enregistrees."
else
  echo "AVERTISSEMENT: l'enregistrement a echoue (les policies, elles, SONT posees)."
  echo "Sans consequence sur la securite: seul \`supabase migration list\` les reverra en attente."
fi
echo

echo "===== APRES ====="
afficher_etat

IFS='|' read -r D_SALLE D_ARGENT D_TRIG D_CONTR D_POL D_ANC <<< "$(lire_compteurs)"
if [ "$D_SALLE" = "1" ] && [ "$D_ARGENT" = "1" ] && [ "$D_TRIG" = "1" ] \
   && [ "$D_CONTR" = "1" ] && [ "$D_POL" = "9" ] && [ "$D_ANC" = "0" ]; then
  echo "rls: APPLIQUE"
  echo
  echo "Reste a faire a la main, et ce n'est pas optionnel:"
  echo "  1. Verifier qu'un caissier encaisse bien DEPUIS LA NOTE (pas seulement"
  echo "     depuis l'ecran POS): c'est le chemin qui etait casse."
  echo "  2. Valider la contrainte de montants une fois les donnees verifiees:"
  echo "       select count(*) from public.orders"
  echo "        where total < 0 or subtotal < 0 or coalesce(discount_amount,0) < 0"
  echo "           or coalesce(service_charge_amount,0) < 0 or coalesce(tip_amount,0) < 0;"
  echo "       -- si 0: alter table public.orders"
  echo "       --        validate constraint orders_montants_non_negatifs_check;"
  exit 0
fi

echo "rls: ETAT-INATTENDU apres application - lire les compteurs ci-dessus." >&2
exit 7
