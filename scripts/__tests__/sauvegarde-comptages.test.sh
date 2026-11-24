#!/usr/bin/env bash
# Verrouille le juge de la restauration: il doit dire OUI quand tout est
# revenu et NON sur chaque facon de perdre des donnees.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/sauvegarde/lib.sh
t=$(mktemp -d)
echec=0
ok() { echo "ok - $1"; }
ko() { echo "not ok - $1"; echec=1; }

cat > "$t/copy.txt" <<'SQL'
SET statement_timeout = 0;
COPY public.tenants (id, name) FROM stdin;
1	Chez Awa
2	Le Jardin\nN'Djamena
\.
COPY "auth"."users" (id) FROM stdin;
a
\.
COPY public.vide (id) FROM stdin;
\.
SQL
comptages_depuis_copy < "$t/copy.txt" > "$t/attendu.txt"
printf 'auth.users 1\npublic.tenants 2\npublic.vide 0\n' > "$t/reference.txt"
if diff -q "$t/attendu.txt" "$t/reference.txt" >/dev/null; then ok "comptage depuis COPY (valeur multiligne echappee)"; else ko "comptage depuis COPY"; cat "$t/attendu.txt"; fi

cp "$t/reference.txt" "$t/obtenu.txt"
if comparer_comptages "$t/attendu.txt" "$t/obtenu.txt" >/dev/null; then ok "identique -> accepte"; else ko "identique -> accepte"; fi

printf 'auth.users 1\npublic.tenants 1\npublic.vide 0\n' > "$t/obtenu.txt"
if comparer_comptages "$t/attendu.txt" "$t/obtenu.txt" >/dev/null; then ko "rangee perdue -> refuse"; else ok "rangee perdue -> refuse"; fi

printf 'auth.users 1\npublic.vide 0\n' > "$t/obtenu.txt"
if comparer_comptages "$t/attendu.txt" "$t/obtenu.txt" >/dev/null; then ko "table absente -> refuse"; else ok "table absente -> refuse"; fi

printf 'auth.users absente\npublic.tenants 2\npublic.vide 0\n' > "$t/obtenu.txt"
if comparer_comptages "$t/attendu.txt" "$t/obtenu.txt" >/dev/null; then ko "table non restauree -> refuse"; else ok "table non restauree -> refuse"; fi

: > "$t/vide.txt"
if comparer_comptages "$t/vide.txt" "$t/reference.txt" >/dev/null; then ko "sauvegarde vide -> refuse"; else ok "sauvegarde vide -> refuse"; fi

exit "$echec"
