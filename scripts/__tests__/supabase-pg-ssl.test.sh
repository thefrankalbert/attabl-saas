#!/usr/bin/env bash
# Locks scripts/lib/supabase-pg-ssl.cjs: the admin scripts must never reach the
# database unencrypted or with the certificate check off, whatever DATABASE_URL
# says. Reads the config node-postgres REALLY ends up with (connectionParameters),
# not the object we hand it, because the URL is merged last and can override it.
# Output: ^supabase-pg-ssl: N/N passed
set -euo pipefail
cd "$(dirname "$0")/../.."

ca_file="$(mktemp)"
trap 'rm -f "$ca_file"' EXIT
printf -- '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n' > "$ca_file"

CA_FILE="$ca_file" node - <<'NODE'
const assert = require('assert');
const { Client } = require('pg');
const { supabasePgConfig } = require('./scripts/lib/supabase-pg-ssl.cjs');

const base = 'postgresql://postgres:pw@db.ref.supabase.co:5432/postgres';
const effectiveSsl = (cfg) => new Client(cfg).connectionParameters.ssl;
let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log(`ok - ${name}`); };

// Negative witness: without the helper, these URLs really do turn TLS off or
// disable verification. If this stops being true, the tests below prove nothing.
check('temoin: a bare URL connects WITHOUT TLS', () => {
  assert.strictEqual(effectiveSsl({ connectionString: base }), false);
});
check('temoin: ?ssl=no-verify overrides an ssl object', () => {
  const ssl = effectiveSsl({ connectionString: `${base}?ssl=no-verify`, ssl: { rejectUnauthorized: true } });
  assert.strictEqual(ssl.rejectUnauthorized, false);
});

for (const suffix of ['', '?sslmode=disable', '?ssl=no-verify', '?sslmode=require&sslrootcert=/x', '?sslmode=prefer&uselibpqcompat=true']) {
  check(`TLS verified with url "${suffix || '(bare)'}"`, () => {
    const ssl = effectiveSsl(supabasePgConfig(base + suffix, process.env.CA_FILE));
    assert.ok(ssl && typeof ssl === 'object', 'ssl must be an object');
    assert.strictEqual(ssl.rejectUnauthorized, true);
    assert.match(ssl.ca, /BEGIN CERTIFICATE/);
  });
}

check('refuses to run without SUPABASE_DB_CA_CERT', () => {
  assert.throws(() => supabasePgConfig(base, undefined), /SUPABASE_DB_CA_CERT/);
  assert.throws(() => supabasePgConfig(base, ''), /SUPABASE_DB_CA_CERT/);
});

check('keeps credentials, host and database', () => {
  const p = new Client(supabasePgConfig(`${base}?sslmode=disable`, process.env.CA_FILE)).connectionParameters;
  assert.deepStrictEqual([p.user, p.password, p.host, p.port, p.database], ['postgres', 'pw', 'db.ref.supabase.co', 5432, 'postgres']);
});

console.log(`supabase-pg-ssl: ${passed}/${passed} passed`);
NODE
