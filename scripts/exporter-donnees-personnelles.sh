#!/usr/bin/env bash
#
# Exporte TOUT ce que la base detient sur une personne ou sur un restaurant.
#
# Pourquoi ce script existe (2026-11-05) : la politique de confidentialite annonce
# un droit d'acces, de rectification, de suppression et de portabilite, et renvoie
# vers une adresse de contact. Traiter ces demandes A LA MAIN est parfaitement
# admis - le delai de reference est d'un mois - MAIS encore faut-il pouvoir le
# faire. Sans cet outil, repondre a une seule demande imposait d'ecrire des
# requetes SQL a chaud sur la production, table par table, en esperant n'en
# oublier aucune.
#
# Et il y en a DIX-NEUF. La liste n'a pas ete devinee, elle est derivee du schema
# de production (colonnes email/phone/name/address/ip + les cles user_id,
# created_by, invited_by). Les moins evidentes sont les plus faciles a oublier :
#   - `user_sessions` porte l'adresse IP et le user-agent, qui sont des donnees
#     personnelles a part entiere ;
#   - `audit_log` et `platform_audit_log` conservent l'email de l'auteur ;
#   - `newsletter_subscriber` vit en dehors de tout tenant.
#
# LECTURE SEULE, et c'est garanti par la base elle-meme : chaque requete tourne
# dans une transaction `READ ONLY`, donc une faute de frappe qui se transformerait
# en UPDATE serait refusee par PostgreSQL, pas seulement par la prudence de
# l'auteur.
#
# Usage :
#   ./scripts/exporter-donnees-personnelles.sh --email adresse@exemple.com --sortie ~/demande-42
#   ./scripts/exporter-donnees-personnelles.sh --tenant mon-resto          --sortie ~/demande-43
#
# Sortie : un fichier JSON par table non vide, plus `manifeste.json` qui horodate
# la demande, liste les tables parcourues et le nombre de lignes trouvees. Ce
# manifeste EST la trace a conserver : c'est lui qui prouve qu'on a repondu, quand,
# et sur quel perimetre.
#
# Contrat de sortie, grep-friendly :
#   ^export: OK <n> table(s), <m> ligne(s)
#   ^export: VIDE   (sujet introuvable)
#   ^export: ERREUR <raison>

set -uo pipefail

SUJET=""
VALEUR=""
SORTIE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --email)  SUJET="email";  VALEUR="${2:-}"; shift 2 ;;
    --tenant) SUJET="tenant"; VALEUR="${2:-}"; shift 2 ;;
    --sortie) SORTIE="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "export: ERREUR option inconnue '$1'"; exit 2 ;;
  esac
done

if [ -z "$SUJET" ] || [ -z "$VALEUR" ]; then
  echo "export: ERREUR il faut --email <adresse> ou --tenant <slug>"
  exit 2
fi
if [ -z "$SORTIE" ]; then
  echo "export: ERREUR il faut --sortie <dossier>"
  exit 2
fi

# La valeur est interpolee dans du SQL. On refuse tout ce qui pourrait en sortir
# plutot que de tenter d'echapper: un email ou un slug legitime n'a jamais besoin
# de quote, de point-virgule ni de tiret double.
case "$VALEUR" in
  *\'*|*\"*|*\;*|*--*|*\\*)
    echo "export: ERREUR la valeur contient un caractere interdit (quote, point-virgule, tiret double ou antislash)"
    exit 2 ;;
esac
VAL_SQL="'$VALEUR'"


# Le dossier de sortie contient des donnees personnelles en clair. Ce depot est
# PUBLIC : on refuse categoriquement d'ecrire dedans, meme si l'utilisateur le
# demande. Une fuite par `git add -A` distrait est un accident en une commande.
RACINE_DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Le chemin est resolu SANS exiger qu'il existe : le controle d'appartenance au
# depot doit avoir lieu AVANT toute creation de dossier. Une premiere version
# faisait `cd "$(dirname "$SORTIE")"`, qui echoue en silence sur un parent
# inexistant et produisait un chemin absurde comme `/personne`.
case "$SORTIE" in
  /*) SORTIE_ABS="$SORTIE" ;;
  ~*) SORTIE_ABS="${SORTIE/#\~/$HOME}" ;;
  *)  SORTIE_ABS="$PWD/$SORTIE" ;;
esac
case "$SORTIE_ABS/" in
  "$RACINE_DEPOT"/*)
    echo "export: ERREUR le dossier de sortie est DANS le depot, qui est public."
    echo "        Choisis un chemin hors du depot, par exemple ~/demandes-rgpd/42."
    exit 2 ;;
esac

if [ -z "${DATABASE_URL:-}" ]; then
  echo "export: ERREUR DATABASE_URL n'est pas defini."
  echo "        Exemple: export DATABASE_URL=\"\$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2-)\""
  exit 2
fi

command -v psql >/dev/null 2>&1 || { echo "export: ERREUR psql introuvable dans le PATH"; exit 2; }

mkdir -p "$SORTIE_ABS" || { echo "export: ERREUR impossible de creer $SORTIE_ABS"; exit 2; }

# Chaque entree : <nom de fichier>|<condition SQL pour --email>|<condition pour --tenant>
# Une condition vide signifie "cette table ne concerne pas ce type de sujet".
#
# $ID designe l'identifiant resolu : l'uuid auth.users pour --email, l'uuid du
# tenant pour --tenant. $VAL designe la valeur brute passee en argument.
TABLES=$(cat <<'FIN'
admin_users|user_id = any($IDS) OR lower(email) = lower($VAL) OR created_by = any($IDS)|tenant_id = $ID
invitations|lower(email) = lower($VAL) OR invited_by = any($IDS)|tenant_id = $ID
audit_log|user_id = any($IDS) OR lower(user_email) = lower($VAL)|tenant_id = $ID
platform_audit_log|lower(actor_email) = lower($VAL)|
newsletter_subscriber|lower(email) = lower($VAL)|
notifications|user_id = any($IDS)|tenant_id = $ID
push_subscriptions|user_id = any($IDS)|tenant_id = $ID
user_preferences|user_id = any($IDS)|
user_sessions|user_id = any($IDS)|tenant_id = $ID
ai_credits_ledger|user_id = any($IDS)|tenant_id = $ID
order_notes|created_by = any($IDS)|tenant_id = $ID
payments|created_by = any($IDS)|tenant_id = $ID
stock_counts|created_by = any($IDS)|tenant_id = $ID
stock_movements|created_by = any($IDS)|tenant_id = $ID
house_accounts|created_by = any($IDS)|tenant_id = $ID
dish_photo_drafts|created_by = any($IDS)|tenant_id = $ID
orders||tenant_id = $ID
suppliers||tenant_id = $ID
tenants||id = $ID
FIN
)

sql_lecture_seule() {
  # `-v ON_ERROR_STOP=1` : une table ou une colonne absente doit FAIRE ECHOUER
  # l'export, pas produire un fichier vide qu'on prendrait pour "aucune donnee".
  psql "$DATABASE_URL" -X -q -A -t -v ON_ERROR_STOP=1 \
    -c "begin read only;" -c "$1" -c "commit;" 2>&1
}

# --- Resolution du sujet -----------------------------------------------------
#
# POURQUOI DEUX IDENTIFIANTS. Les cles etrangeres de ce schema sont MELANGEES,
# verifie sur les contraintes reelles:
#   - vers auth.users(id)       : admin_users.user_id, audit_log.user_id,
#                                 ai_credits_ledger.user_id, dish_photo_drafts.created_by
#   - vers public.admin_users(id): invitations.invited_by, payments.created_by,
#                                 order_notes.created_by, house_accounts.created_by,
#                                 admin_users.created_by, user_preferences.user_id,
#                                 user_sessions.user_id
#   - sans contrainte du tout    : notifications.user_id, push_subscriptions.user_id,
#                                 stock_counts.created_by, stock_movements.created_by
#
# Une premiere version n'utilisait que l'identifiant de COMPTE: elle rendait
# 2 tables la ou il y en avait davantage, en manquant silencieusement les
# invitations envoyees, les encaissements saisis et les mouvements de stock.
# Un export incomplet est pire que pas d'export: il donne l'illusion d'avoir
# repondu.
#
# Plutot que de trancher table par table - et de se tromper sur les quatre sans
# contrainte - on interroge l'UNION des identifiants. Deux UUID distincts ne se
# confondent pas, donc l'union n'ajoute aucun faux positif, mais elle garantit
# qu'aucune ligne n'est manquee. Une personne peut avoir PLUSIEURS lignes
# admin_users (une par restaurant): elles sont toutes incluses.
if [ "$SUJET" = "email" ]; then
  UID_AUTH=$(sql_lecture_seule "select id from auth.users where lower(email) = lower($VAL_SQL) limit 1;" | head -1)
  AIDS=$(sql_lecture_seule "select string_agg(quote_literal(a.id::text), ',') from admin_users a left join auth.users u on u.id = a.user_id where lower(a.email) = lower($VAL_SQL) or lower(u.email) = lower($VAL_SQL);" | head -1)

  LISTE=""
  [ -n "$UID_AUTH" ] && LISTE="'$UID_AUTH'"
  if [ -n "$AIDS" ]; then
    [ -n "$LISTE" ] && LISTE="$LISTE,$AIDS" || LISTE="$AIDS"
  fi
  if [ -z "$LISTE" ]; then
    # Ni compte ni appartenance: la personne peut encore figurer dans les
    # invitations ou la newsletter, qui ne dependent d'aucun compte. On poursuit
    # avec une liste vide plutot que de conclure "rien" a tort.
    LISTE="'00000000-0000-0000-0000-000000000000'"
    echo "   (aucun compte ni appartenance - on cherche dans les tables qui n'en dependent pas)"
  else
    echo "   identifiants retenus: $LISTE"
  fi
  SQL_IDS="array[$LISTE]::uuid[]"
  ID="${UID_AUTH:-(aucun compte)}"
else
  ID=$(sql_lecture_seule "select id from tenants where slug = $VAL_SQL limit 1;" | head -1)
  if [ -z "$ID" ]; then
    echo "export: VIDE aucun restaurant avec le slug '$VALEUR'"
    exit 1
  fi
  SQL_ID="'$ID'::uuid"
fi

# --- Export ------------------------------------------------------------------
NB_TABLES=0
NB_LIGNES=0
LISTE_MANIFESTE=""

while IFS='|' read -r TABLE COND_EMAIL COND_TENANT; do
  [ -z "$TABLE" ] && continue
  if [ "$SUJET" = "email" ]; then COND="$COND_EMAIL"; else COND="$COND_TENANT"; fi
  [ -z "$COND" ] && continue

  COND="${COND//\$IDS/${SQL_IDS:-}}"
  COND="${COND//\$ID/${SQL_ID:-}}"
  # La valeur est injectee entre quotes SQL. On la prepare dans une variable
  # plutot que d'echapper les quotes dans l'expression de substitution: `\'`
  # entre guillemets doubles produit un ANTISLASH litteral, que PostgreSQL
  # refuse ("syntax error at or near \\").
  COND="${COND//\$VAL/$VAL_SQL}"

  RES=$(sql_lecture_seule "select coalesce(json_agg(t)::text, '[]') from public.$TABLE t where $COND;")
  if printf '%s' "$RES" | grep -qiE '^(ERROR|psql:)'; then
    echo "export: ERREUR sur la table $TABLE"
    printf '   %s\n' "$RES" | head -3
    exit 1
  fi

  N=$(printf '%s' "$RES" | python3 -c 'import json,sys; print(len(json.loads(sys.stdin.read() or "[]")))' 2>/dev/null || echo 0)
  if [ "$N" -gt 0 ]; then
    printf '%s' "$RES" | python3 -m json.tool > "$SORTIE_ABS/$TABLE.json"
    NB_TABLES=$((NB_TABLES + 1))
    NB_LIGNES=$((NB_LIGNES + N))
    printf '   %-24s %s ligne(s)\n' "$TABLE" "$N"
  fi
  LISTE_MANIFESTE="$LISTE_MANIFESTE{\"table\":\"$TABLE\",\"lignes\":$N},"
done <<< "$TABLES"

cat > "$SORTIE_ABS/manifeste.json" <<FIN
{
  "demande": { "type": "$SUJET", "valeur": "$VALEUR", "identifiant_resolu": "$ID" },
  "exporte_le": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "tables_avec_donnees": $NB_TABLES,
  "lignes_totales": $NB_LIGNES,
  "tables_parcourues": [ ${LISTE_MANIFESTE%,} ]
}
FIN

if [ "$NB_LIGNES" -eq 0 ]; then
  echo "export: VIDE aucune donnee pour ce sujet (manifeste ecrit quand meme, il prouve la recherche)"
  exit 0
fi

echo "export: OK $NB_TABLES table(s), $NB_LIGNES ligne(s)"
echo "   dossier: $SORTIE_ABS"
echo "   RAPPEL: ces fichiers contiennent des donnees personnelles en clair."
echo "   Verifier l'identite du demandeur AVANT de les lui transmettre."
