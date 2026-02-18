/**
 * Apply missing migrations directly via PostgreSQL connection.
 * Uses DATABASE_URL from .env.local
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env
function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(__dirname, '..', '.env.local'),
    '/Users/a.g.i.c/Documents/attabl-saas-landing-copy/.env.local',
  ];
  for (const envPath of candidates) {
    try {
      const raw = fs.readFileSync(envPath, 'utf8');
      const vars = {};
      raw.split('\n').forEach((line) => {
        const m = line.match(/^([^#=][^=]*)=(.*)$/);
        if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      });
      console.log(`  Loaded env from ${envPath}`);
      return vars;
    } catch {
      // next
    }
  }
  return {};
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

// Read the SQL file
const sqlPath = path.resolve(__dirname, 'apply-missing-migrations.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

console.log(`  SQL file: ${sqlPath} (${(sql.length / 1024).toFixed(1)} KB)`);
console.log(`  Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
console.log('');
console.log('  Applying migrations...');

// Use fetch to call Supabase SQL API
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

async function executeSql(sqlText) {
  // Use Supabase's pg REST endpoint
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ query: sqlText }),
  });

  if (!response.ok) {
    // Fallback: try the SQL endpoint directly
    throw new Error(`REST API failed: ${response.status}`);
  }
  return response.json();
}

// Split SQL into individual statements and execute via pg module
// Since we don't have pg, let's use the native postgres via dynamic import
async function main() {
  try {
    // Try using postgres (porsager/postgres) which might be available
    const { default: postgres } = await import('postgres');
    const sql2 = postgres(DATABASE_URL, { ssl: 'require' });

    // Remove BEGIN/COMMIT wrapper (postgres module handles transactions differently)
    let cleanSql = sql.replace(/^BEGIN;\s*/m, '').replace(/\nCOMMIT;\s*$/m, '');

    // Execute inside a proper transaction
    await sql2.begin(async (tx) => {
      await tx.unsafe(cleanSql);
    });

    console.log('  ✅ All migrations applied successfully!');
    await sql2.end();
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND' || e.message?.includes('Cannot find')) {
      console.log('  postgres module not found, installing...');
      // We'll need to install it
      const { execSync } = await import('child_process');
      execSync('pnpm add -D postgres', { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });

      // Re-try
      const { default: postgres } = await import('postgres');
      const sql2 = postgres(DATABASE_URL, { ssl: 'require' });
      let cleanSql = sql.replace(/^BEGIN;\s*/m, '').replace(/\nCOMMIT;\s*$/m, '');
      await sql2.begin(async (tx) => {
        await tx.unsafe(cleanSql);
      });
      console.log('  ✅ All migrations applied successfully!');
      await sql2.end();
    } else {
      throw e;
    }
  }
}

main().catch((e) => {
  console.error('  ❌ Migration failed:', e.message);
  process.exit(1);
});
