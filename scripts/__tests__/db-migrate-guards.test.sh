#!/usr/bin/env bash
# Locks the guards of scripts/db-migrate.sh: no `supabase db push` on production,
# and target `local` only on this machine. Runs the script in a sandbox with a
# FAKE `supabase` command that only records its arguments: no database is ever
# contacted. Output: ^db-migrate-guards: N/N passed
set -euo pipefail
cd "$(dirname "$0")/../.."

sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
mkdir -p "$sandbox/scripts" "$sandbox/bin"
cp scripts/db-migrate.sh "$sandbox/scripts/"
cat > "$sandbox/bin/supabase" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$SUPABASE_CALLS"
STUB
chmod +x "$sandbox/bin/supabase"
export PATH="$sandbox/bin:$PATH"
export SUPABASE_CALLS="$sandbox/calls.log"

passed=0
total=0
run_case() { # name expected_exit expect_push(yes|no) args...
  local name="$1" want="$2" push="$3"
  shift 3
  total=$((total + 1))
  : > "$SUPABASE_CALLS"
  set +e
  bash "$sandbox/scripts/db-migrate.sh" "$@" > /dev/null 2>&1
  local got=$?
  set -e
  local pushed=no
  grep -q '^db push' "$SUPABASE_CALLS" && pushed=yes
  if [ "$got" = "$want" ] && [ "$pushed" = "$push" ]; then
    passed=$((passed + 1))
    echo "ok - $name"
  else
    echo "FAIL - $name (exit $got, attendu $want; push=$pushed, attendu $push)"
  fi
}

remote='DATABASE_URL=postgresql://u:p@aws-1-eu-west-1.pooler.supabase.com:5432/postgres'
local_db='DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres'

echo "$remote" > "$sandbox/.env.local"
run_case 'production sans --dry-run: refus, aucun push' 3 no --target production
run_case 'production --dry-run: lecture seule, aucun push' 0 no --target production --dry-run
run_case 'local vers une base distante (.env.local = prod): refus' 3 no --target local

echo "$local_db" > "$sandbox/.env.local"
run_case 'temoin: local vers 127.0.0.1 pousse bien' 0 yes --target local

echo "$remote" > "$sandbox/.env.staging"
run_case 'temoin: staging pousse bien' 0 yes --target staging

echo "db-migrate-guards: $passed/$total passed"
[ "$passed" = "$total" ]
