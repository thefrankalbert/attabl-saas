/**
 * RLS Audit Script
 *
 * Checks which public tables have Row Level Security (RLS) enabled.
 * Run with: npx tsx scripts/audit-rls.ts
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const loadEnv = (): Record<string, string> => {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    const envFile = fs.readFileSync(envPath, 'utf8');
    const envVars: Record<string, string> = {};
    envFile.split('\n').forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    });
    return envVars;
  } catch {
    return {};
  }
};

const env = loadEnv();

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('Ensure .env.local exists with the required variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function auditRLS() {
  console.log('=== RLS Audit: Public Schema Tables ===\n');

  // Try to use the audit_rls_status RPC function if available
  let data: Array<{ tablename: string; rowsecurity: boolean }> | null = null;
  let rpcAvailable = false;

  try {
    const result = await supabase.rpc('audit_rls_status');
    if (!result.error && result.data) {
      data = result.data as Array<{ tablename: string; rowsecurity: boolean }>;
      rpcAvailable = true;
    }
  } catch {
    // RPC not available, fall through to manual instructions
  }

  if (rpcAvailable && data) {
    console.log('Table Name'.padEnd(40) + 'RLS Enabled');
    console.log('-'.repeat(55));

    let rlsDisabledCount = 0;

    for (const table of data) {
      const status = table.rowsecurity ? 'YES' : 'NO  <-- WARNING';
      if (!table.rowsecurity) rlsDisabledCount++;
      console.log(`${table.tablename.padEnd(40)}${status}`);
    }

    console.log(`\nTotal tables: ${data.length}`);
    console.log(`RLS disabled: ${rlsDisabledCount}`);

    if (rlsDisabledCount > 0) {
      console.log('\nWARNING: Some tables do not have RLS enabled.');
      console.log('Review these tables to ensure they are intentionally unprotected.');
    } else {
      console.log('\nAll public tables have RLS enabled.');
    }
  } else {
    // Fallback: provide SQL to run manually
    console.log('Could not query RLS status programmatically.');
    console.log('The RPC function "audit_rls_status" is not available.\n');
    console.log('To check RLS status, run this SQL in the Supabase SQL Editor:\n');
    console.log(`  SELECT
    schemaname,
    tablename,
    rowsecurity AS rls_enabled
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;`);
    console.log('\nOr create the RPC function for automated checks:\n');
    console.log(`  CREATE OR REPLACE FUNCTION audit_rls_status()
  RETURNS TABLE (tablename text, rowsecurity boolean)
  LANGUAGE sql
  SECURITY DEFINER
  AS $$
    SELECT tablename::text, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename;
  $$;`);
  }
}

auditRLS();
