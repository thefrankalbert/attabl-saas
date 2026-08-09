#!/usr/bin/env bash
#
# Sauvegarde la base de production, puis affiche deux comptages en LECTURE SEULE.
#
# Pourquoi ce script existe: il n'y a AUCUNE ecriture ici. Il fait deux choses.
#
#   1. Une sauvegarde complete de la base (pg_dump) dans ton dossier personnel.
#      C'est le filet de securite exige avant d'appliquer les migrations RLS.
#
#   2. Deux comptages qui decident du code a ecrire ensuite:
#      - combien de restaurants ont un plan payant SANS abonnement Stripe
#        (= la faille "Business gratuit a vie" est-elle deja exploitee ?)
#      - combien de commandes ont une devise differente de celle du restaurant
#        (= y a-t-il deja des montants faux en base, a un facteur 100 ?)
#
# Usage: bash scripts/sauvegarde-et-mesures.sh
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

echo ""
echo "==================================================================="
echo "  ATTABL - sauvegarde de la base + mesures (aucune modification)"
echo "==================================================================="
echo ""

if [ ! -f .env.local ]; then
  echo "ERREUR: le fichier .env.local est introuvable."
  echo "Il doit se trouver a la racine du projet attabl-saas."
  exit 1
fi

# On NE source PAS .env.local. Ce fichier n'est pas un script shell: il contient
# des valeurs non quotees comme `RESEND_FROM_EMAIL=Attabl <notifications@...>`,
# et le shell interprete `<` comme une redirection. Le chargement s'arretait donc
# en plein milieu, DATABASE_URL n'etait jamais lu, et le script concluait a tort
# a un mot de passe perime.
#
# On extrait UNIQUEMENT la ligne dont on a besoin, sans rien interpreter.
extract_env() {
  # $1 = nom de la variable. Prend la premiere occurrence, retire les guillemets
  # eventuels et l'espace de fin. Aucune evaluation par le shell.
  sed -n "s/^$1=//p" .env.local | head -1 | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//'
}

DATABASE_URL="$(extract_env DATABASE_URL)"
DATABASE_URL_POOLED="$(extract_env DATABASE_URL_POOLED)"

if [ -z "$DATABASE_URL" ] && [ -z "$DATABASE_URL_POOLED" ]; then
  echo "ERREUR: ni DATABASE_URL ni DATABASE_URL_POOLED dans .env.local."
  exit 1
fi

command -v pg_dump >/dev/null || { echo "ERREUR: pg_dump introuvable (installe PostgreSQL)."; exit 1; }
command -v psql >/dev/null || { echo "ERREUR: psql introuvable (installe PostgreSQL)."; exit 1; }

echo "[1/3] Test de connexion a la base..."
# Deux URL possibles: la directe et celle qui passe par le pooler. On essaie les
# deux avant de conclure quoi que ce soit, et on garde celle qui repond.
CONN=""
ERRLOG="/tmp/attabl-conn-err.log"
: > "$ERRLOG"
for candidate in "$DATABASE_URL" "$DATABASE_URL_POOLED"; do
  [ -z "$candidate" ] && continue
  if psql "$candidate" -t -c "select 1;" >/dev/null 2>>"$ERRLOG"; then
    CONN="$candidate"
    break
  fi
done

if [ -z "$CONN" ]; then
  echo ""
  echo "ECHEC DE CONNEXION. Message exact renvoye par la base:"
  echo "---"
  tail -3 "$ERRLOG" | sed 's/^/  /'
  echo "---"
  echo ""
  if grep -qi "password authentication failed\|authentification par mot de passe" "$ERRLOG"; then
    echo "=> C'est bien un MOT DE PASSE refuse."
    echo "   Va sur https://supabase.com/dashboard -> ton projet -> Settings ->"
    echo "   Database -> Reset database password. Copie le nouveau mot de passe"
    echo "   dans la ligne DATABASE_URL de .env.local, puis relance ce script."
  else
    echo "=> Ce N'EST PAS un probleme de mot de passe. Copie le message ci-dessus"
    echo "   a Claude: la cause est ailleurs (reseau, pare-feu, projet en pause)."
  fi
  exit 1
fi
echo "      Connexion OK."
echo ""

BACKUP="$HOME/attabl-backup-$(date +%Y%m%d-%H%M).sql"
echo "[2/3] Sauvegarde complete de la base en cours..."
echo "      (cela peut prendre une a deux minutes, c'est normal)"

# pg_dump exige une connexion en mode SESSION. Sur le pooler Supabase, le port
# 6543 est le mode TRANSACTION: pg_dump y echoue (il ouvre plusieurs requetes
# dans une meme session). Le port 5432 est le mode session. On force donc une
# connexion en 5432 pour le dump, meme si le test de connexion a retenu l'autre.
DUMP_CONN="$CONN"
case "$CONN" in
  *:6543/*)
    for candidate in "$DATABASE_URL" "$DATABASE_URL_POOLED"; do
      case "$candidate" in
        *:5432/*) DUMP_CONN="$candidate"; break ;;
      esac
    done
    if [ "$DUMP_CONN" = "$CONN" ]; then
      echo "      ATTENTION: seule une connexion en mode transaction (port 6543)"
      echo "      est disponible. pg_dump va probablement echouer."
    fi
    ;;
esac

if pg_dump "$DUMP_CONN" --no-owner --no-privileges -f "$BACKUP" 2>/tmp/attabl-dump-err.log; then
  echo "      SAUVEGARDE REUSSIE:"
  ls -lh "$BACKUP" | awk '{print "      fichier: " $NF "   taille: " $5}'
else
  echo "      ECHEC de la sauvegarde. Detail:"
  tail -5 /tmp/attabl-dump-err.log
  echo "      On s'arrete la: pas de mesures tant qu'il n'y a pas de filet."
  exit 1
fi
echo ""

echo "[3/3] Mesures (lecture seule)..."
echo ""
psql "$CONN" -f scripts/mesures-prod.sql

echo ""
echo "==================================================================="
echo "  Termine. Copie TOUT le texte ci-dessus et colle-le a Claude."
echo "  Sauvegarde conservee ici: $BACKUP"
echo "==================================================================="
echo ""
