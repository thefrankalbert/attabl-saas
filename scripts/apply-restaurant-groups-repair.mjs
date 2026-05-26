/**
 * Applies restaurant_groups repair migration when supabase link/db push is unavailable.
 * Run: node scripts/apply-restaurant-groups-repair.mjs
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnvFiles() {
  const merged = { ...process.env };
  for (const file of ['.env.local', '.env']) {
    const envPath = path.join(root, file);
    if (!fs.existsSync(envPath)) continue;
    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .forEach((line) => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (!match) return;
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (value) merged[key] = value;
      });
  }
  return merged;
}

function resolveDatabaseUrl(env) {
  if (env.DATABASE_URL?.trim()) return env.DATABASE_URL.trim();
  if (env.SUPABASE_DB_URL?.trim()) return env.SUPABASE_DB_URL.trim();

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const dbPassword = env.SUPABASE_DB_PASSWORD?.trim();
  if (!supabaseUrl || !dbPassword) return null;

  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match) return null;
  const projectRef = match[1];
  const host = env.SUPABASE_DB_HOST?.trim() || `db.${projectRef}.supabase.co`;

  return `postgresql://postgres:${encodeURIComponent(dbPassword)}@${host}:5432/postgres`;
}

async function main() {
  const env = loadEnvFiles();
  const databaseUrl = resolveDatabaseUrl(env);
  if (!databaseUrl) {
    console.error(
      'Missing DB connection. Set DATABASE_URL, SUPABASE_DB_URL, or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD in .env.local',
    );
    process.exit(1);
  }

  const migrationPath = path.join(
    root,
    'supabase/migrations/20260526120000_ensure_restaurant_groups_for_signup.sql',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000,
  });

  console.log('Connecting to database...');
  await client.connect();
  console.log('Applying restaurant_groups repair migration...');
  await client.query(sql);
  await client.end();
  console.log('migration: OK - restaurant_groups + provision_signup_tenant ready');
}

main().catch((err) => {
  console.error('migration: FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
