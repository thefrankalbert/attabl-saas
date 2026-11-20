// TLS for the direct Postgres connections that local admin scripts open to
// Supabase. Fail closed: the link is encrypted AND the server certificate is
// verified, or there is no connection at all.
//
// Why a CA file: Supabase signs its database certificates with its own root
// authority, which Node does not trust by default. Download it once from the
// Supabase dashboard (Project Settings > Database > SSL Configuration >
// Download certificate) and set SUPABASE_DB_CA_CERT=<path to that file> in
// .env.local. The file is public, not a secret.
//
// Why the URL is cleaned: node-postgres parses the connection string LAST and
// lets it override the `ssl` object, so `?sslmode=disable` or `?ssl=no-verify`
// in DATABASE_URL would silently switch encryption or verification off.

const fs = require('fs');

const TLS_URL_PARAMS = ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat'];

function supabasePgConfig(databaseUrl, caPath) {
  if (!caPath) {
    throw new Error(
      'SUPABASE_DB_CA_CERT manquant. Telecharger le certificat dans Supabase ' +
        '(Project Settings > Database > SSL Configuration) et indiquer son chemin ' +
        'dans .env.local. Sans lui, la connexion ne peut pas etre verifiee.',
    );
  }
  const url = new URL(databaseUrl);
  for (const param of TLS_URL_PARAMS) url.searchParams.delete(param);
  return {
    connectionString: url.toString(),
    ssl: { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true },
  };
}

exports.supabasePgConfig = supabasePgConfig;
