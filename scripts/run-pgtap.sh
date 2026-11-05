#!/usr/bin/env bash
#
# Lance les tests pgTAP de supabase/tests/rls/ contre un vrai Postgres.
#
# POURQUOI CE SCRIPT EXISTE. Ces tests prouvent que le refus vient des
# PRIVILEGES Postgres et des policies RLS, pas du code applicatif. Aucun test
# Vitest ne peut en rendre compte: il remplace justement la couche qui refuse.
# Ils existaient depuis des mois sans AUCUN executant - donc sans jamais etre
# rejoues. Une preuve qu'on ne rejoue pas n'est plus une preuve.
#
# Deux modes:
#   scripts/run-pgtap.sh --local      monte un cluster jetable et le detruit
#   scripts/run-pgtap.sh --db-url URL utilise un serveur existant (la CI)
#
# Le mode --local ne demande NI Docker NI le CLI Supabase: juste postgresql@17
# et son paquet pgtap. Le harnais du depot (run-journeys-local.sh) exige Docker,
# ce qui le rendait inutilisable sur une machine qui n'en a pas.
#
# Sortie grep-friendly, derniere ligne: ^pgtap: N/N passed | F failed | ERROR
#
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE=""
DB_URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --local)  MODE="local"; shift ;;
    --db-url) MODE="url"; DB_URL="${2:-}"; shift 2 ;;
    *) echo "Usage: $0 --local | --db-url <URL>" >&2; exit 2 ;;
  esac
done
if [ -z "$MODE" ]; then
  echo "ERREUR: choisir --local ou --db-url <URL>." >&2
  exit 2
fi

# Le serveur de production est en 17.x. Un client 16 refuse de dialoguer avec
# certains dumps 17 ("annulation a cause de la difference des versions"), et le
# schema peut utiliser une syntaxe inconnue de 16: on exige donc 17+.
for candidate in /opt/homebrew/opt/postgresql@17/bin /usr/lib/postgresql/17/bin; do
  [ -x "$candidate/psql" ] && export PATH="$candidate:$PATH" && break
done
command -v psql >/dev/null || { echo "pgtap: ERROR - psql introuvable"; exit 1; }

PG_MAJOR="$(psql --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
if [ "${PG_MAJOR:-0}" -lt 17 ]; then
  echo "pgtap: ERROR - psql $PG_MAJOR trop ancien (17+ requis, la prod est en 17.x)"
  exit 1
fi

# Les journaux d'erreur vont dans un repertoire temporaire, JAMAIS a la racine
# du depot: un echec laissait sinon des fichiers .err non suivis par git, que la
# prochaine personne prend pour un oubli ou commite par accident.
LOGDIR="$(mktemp -d)"
CLEANUP_DIR=""
cleanup() {
  if [ -n "$CLEANUP_DIR" ]; then
    pg_ctl -D "$CLEANUP_DIR/pgdata" stop -m immediate >/dev/null 2>&1
    rm -rf "$CLEANUP_DIR"
  fi
  rm -rf "$LOGDIR"
}
trap cleanup EXIT

if [ "$MODE" = "local" ]; then
  # LC_ALL=C n'est pas cosmetique: sans lui `initdb` echoue sur "configuration
  # invalide de la locale", et le serveur refuse de demarrer avec "postmaster
  # became multithreaded during startup" (mesure sur macOS 27).
  export LC_ALL=C LANG=C
  CLEANUP_DIR="$(mktemp -d)"
  PORT="${PGTAP_PORT:-5440}"

  # TCP et PAS de socket unix: un chemin de socket dans un repertoire temporaire
  # depasse souvent la limite de 103 octets, et le serveur ne demarre pas.
  initdb -D "$CLEANUP_DIR/pgdata" -U postgres --auth=trust --locale=C \
    >"$CLEANUP_DIR/initdb.log" 2>&1 \
    || { echo "pgtap: ERROR - initdb"; tail -5 "$CLEANUP_DIR/initdb.log"; exit 1; }

  pg_ctl -D "$CLEANUP_DIR/pgdata" -o "-h 127.0.0.1 -p $PORT" \
    -l "$CLEANUP_DIR/pg.log" start >/dev/null 2>&1 \
    || { echo "pgtap: ERROR - demarrage"; tail -10 "$CLEANUP_DIR/pg.log"; exit 1; }

  DB_URL="postgresql://postgres@127.0.0.1:$PORT/postgres"
  createdb -h 127.0.0.1 -p "$PORT" -U postgres attabl_pgtap \
    || { echo "pgtap: ERROR - createdb"; exit 1; }
  DB_URL="postgresql://postgres@127.0.0.1:$PORT/attabl_pgtap"
fi

[ -n "$DB_URL" ] || { echo "pgtap: ERROR - URL de base vide"; exit 1; }

# Pre-controle AVANT de tenter le bootstrap: sans ce message, l'echec se lit
# "extension pgtap is not available" et on cherche du cote du script alors que
# c'est le serveur qui n'a pas le paquet. pgTAP n'a PAS de formule Homebrew: sur
# macOS il s'installe depuis les sources (PGXS), ce que personne ne devine.
AVAIL="$(psql "$DB_URL" -X -A -t -c "select count(*) from pg_available_extensions where name='pgtap';" 2>/dev/null || echo 0)"
if [ "${AVAIL:-0}" = "0" ]; then
  echo "pgtap: ERROR - l'extension pgtap n'est pas installee sur ce serveur PostgreSQL."
  echo "  Linux/CI : apt-get install postgresql-17-pgtap"
  echo "  macOS    : pas de formule Homebrew. Depuis les sources:"
  echo "               curl -L https://github.com/theory/pgtap/archive/refs/tags/v1.3.3.tar.gz | tar xz"
  echo "               cd pgtap-1.3.3 && PATH=\"/opt/homebrew/opt/postgresql@17/bin:\$PATH\" make install"
  echo "  Sans pgtap en local, ces tests restent couverts par la CI (.github/workflows/pgtap.yml)."
  exit 1
fi

echo "[1/4] bootstrap (roles, schema auth, extensions, pgtap)"
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap.sql \
  >/dev/null 2>"$LOGDIR/bootstrap.err" \
  || { echo "pgtap: ERROR - bootstrap"; tail -5 "$LOGDIR/bootstrap.err"; exit 1; }

echo "[2/4] chargement de supabase/schema.sql"
# `schema.sql` contient `CREATE SCHEMA IF NOT EXISTS "public"` qui echoue
# puisque public existe deja: c'est la seule erreur attendue, on ne s'arrete
# donc pas au premier echec et on compte les autres.
psql "$DB_URL" -X -q -f supabase/schema.sql >/dev/null 2>"$LOGDIR/schema.err"
UNEXPECTED="$(grep "ERROR" "$LOGDIR/schema.err" | grep -vc 'schema "public" already exists' || true)"
if [ "${UNEXPECTED:-0}" -gt 0 ]; then
  echo "pgtap: ERROR - $UNEXPECTED erreur(s) inattendue(s) au chargement du schema"
  grep "ERROR" "$LOGDIR/schema.err" | grep -v 'schema "public" already exists' | head -5
  exit 1
fi
TABLES="$(psql "$DB_URL" -X -A -t -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")"
echo "      $TABLES tables"

echo "[3/4] migrations posterieures a l'instantane"
# `schema.sql` est un instantane de la production. Les migrations DEJA
# comprises dedans ne doivent pas etre rejouees (beaucoup ne sont pas
# idempotentes). Le marqueur en tete de schema.sql dit jusqu'ou il va; on
# applique uniquement ce qui vient apres. Une migration ajoutee par une PR est
# donc testee, sans qu'il faille regenerer l'instantane a chaque fois.
SNAPSHOT="$(sed -n 's/^-- SCHEMA_SNAPSHOT_MIGRATION=\([0-9]*\).*/\1/p' supabase/schema.sql | head -1)"
if [ -z "$SNAPSHOT" ]; then
  echo "pgtap: ERROR - marqueur SCHEMA_SNAPSHOT_MIGRATION absent de supabase/schema.sql"
  exit 1
fi
APPLIED=0
for f in supabase/migrations/*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"
  # Comparaison ARITHMETIQUE et non lexicale. `[ "$a" \> "$b" ]` depend du shell
  # (en zsh il echoue carrement) et comparerait des chaines; `10#` force la base
  # 10 pour que les versions a zero initial ne soient pas lues en octal.
  if [ "$((10#$v))" -gt "$((10#$SNAPSHOT))" ]; then
    psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$f" \
      >/dev/null 2>"$LOGDIR/migration.err" \
      || { echo "pgtap: ERROR - migration $(basename "$f")"; tail -5 "$LOGDIR/migration.err"; exit 1; }
    APPLIED=$((APPLIED+1))
  fi
done
echo "      instantane jusqu'a $SNAPSHOT, $APPLIED migration(s) appliquee(s) ensuite"

echo "[4/4] tests"
TOTAL=0
FAILED=0
FILES=0
BROKEN=0
for t in supabase/tests/rls/*.test.sql; do
  FILES=$((FILES+1))
  # -A -t sont OBLIGATOIRES, pas une preference. Sans eux psql formate la sortie
  # de pgTAP en tableau aligne avec en-tete et bordures:
  #       plan
  #     --------
  #      1..8
  # Les lignes ne commencent donc pas par `ok`/`not ok`/`1..`, aucun motif ne
  # correspond, et le fichier est compte 0 assertion. C'est le bug qui a rendu
  # un premier run "vert" avec 0/0: un executant qui ne prouve rien est pire que
  # pas d'executant, parce qu'il donne l'illusion d'une couverture.
  OUT="$(psql "$DB_URL" -X -q -A -t -f "$t" 2>&1)"

  # Le plan declare par le test (`select plan(N)` -> ligne `1..N`). C'est le
  # juge: si le nombre d'assertions vues ne l'egale pas, le fichier s'est
  # interrompu en route, meme sans aucun `not ok`.
  PLAN="$(printf '%s\n' "$OUT" | sed -nE 's/^1\.\.([0-9]+)$/\1/p' | head -1)"
  n_ok="$(printf '%s\n' "$OUT" | grep -cE '^ok [0-9]+' || true)"
  n_ko="$(printf '%s\n' "$OUT" | grep -cE '^not ok [0-9]+' || true)"
  seen=$((n_ok + n_ko))
  TOTAL=$((TOTAL + seen))
  FAILED=$((FAILED + n_ko))

  if [ -z "$PLAN" ]; then
    BROKEN=$((BROKEN+1))
    echo "      CASSE $(basename "$t") - aucun plan TAP lu (le test n'a pas demarre)"
    printf '%s\n' "$OUT" | grep -iE 'error|fatal' | head -5 | sed 's/^/        /'
  elif [ "$seen" -ne "$PLAN" ]; then
    BROKEN=$((BROKEN+1))
    echo "      CASSE $(basename "$t") - plan $PLAN mais $seen assertion(s) vue(s)"
    printf '%s\n' "$OUT" | grep -iE '^not ok|error|fatal' | head -8 | sed 's/^/        /'
  elif [ "$n_ko" -gt 0 ]; then
    echo "      ECHEC $(basename "$t") ($n_ok ok / $n_ko not ok sur $PLAN)"
    printf '%s\n' "$OUT" | grep -E '^not ok|^# ' | head -12 | sed 's/^/        /'
  else
    echo "      ok    $(basename "$t") ($n_ok/$PLAN assertions)"
  fi
done

if [ "$FILES" -eq 0 ]; then
  echo "pgtap: ERROR - aucun fichier de test trouve dans supabase/tests/rls/"
  exit 1
fi
# Un total nul est un ECHEC, jamais un succes. Sans cette garde, un executant
# qui ne lance rien rend 0/0 et la CI passe au vert.
if [ "$TOTAL" -eq 0 ]; then
  echo "pgtap: ERROR - 0 assertion executee sur $FILES fichier(s): l'executant est casse"
  exit 1
fi
if [ "$BROKEN" -gt 0 ]; then
  echo "pgtap: ERROR - $BROKEN fichier(s) interrompu(s) avant la fin de leur plan"
  exit 1
fi
if [ "$FAILED" -gt 0 ]; then
  echo "pgtap: $FAILED failed"
  exit 1
fi
echo "pgtap: $TOTAL/$TOTAL passed"
