#!/usr/bin/env bash
# Sauvegarde complete de la base de production dans out/prod.dump.
# Appele par .github/workflows/sauvegarde.yml. Lecture seule sur la base.
set -euo pipefail

: "${BACKUP_DB_URL:?BACKUP_DB_URL absent}"
: "${PG_IMAGE:?PG_IMAGE absent}"

# La verification TLS se fait avec le certificat racine Supabase versionne.
# Un sslmode dans l'URL l'emporterait sur PGSSLMODE: on le refuse plutot que
# de risquer une connexion non verifiee sans le savoir.
case "$BACKUP_DB_URL" in
  *sslmode=*) echo "::error::BACKUP_DB_URL ne doit pas contenir sslmode (le TLS verifie est impose ici)"; exit 1 ;;
esac

mkdir -p out
docker run --rm --network host \
  -e PGSSLMODE=verify-full \
  -e PGSSLROOTCERT=/certs/supabase-prod-ca-2021.crt \
  -e BACKUP_DB_URL \
  -v "$PWD/supabase/certs:/certs:ro" \
  -v "$PWD/out:/out" \
  --user "$(id -u):$(id -g)" \
  "$PG_IMAGE" \
  sh -c 'pg_dump --format=custom --file=/out/prod.dump "$BACKUP_DB_URL"'

test -s out/prod.dump
echo "sauvegarde: OK ($(du -h out/prod.dump | cut -f1))"
