/**
 * Critical Files Guard
 *
 * This test suite ensures that files essential to the application's security,
 * routing, and multi-tenant isolation are never accidentally deleted.
 *
 * WHY: On 2026-03-30, src/proxy.ts was discovered missing after a merge.
 * Without it, all auth guards, tenant isolation, and subdomain routing broke,
 * exposing every tenant's data to every logged-in user.
 *
 * If this test fails, a critical file was deleted. DO NOT skip this test.
 * Restore the file or get explicit sign-off from the project owner.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

// Files that MUST exist for the app to be secure and functional.
// Add to this list when introducing new security-critical files.
const CRITICAL_FILES = [
  // Auth + tenant routing proxy (Next.js 16 — replaces middleware.ts)
  'src/proxy.ts',
  // Supabase clients (auth boundary enforcement)
  'src/lib/supabase/client.ts',
  'src/lib/supabase/server.ts',
  'src/lib/supabase/admin.ts',
  'src/lib/supabase/middleware.ts',
  // Rate limiting (anti brute-force)
  'src/lib/rate-limit.ts',
  // Admin layout (tenant access verification)
  'src/app/sites/[site]/admin/layout.tsx',
];

describe('Critical files guard', () => {
  it.each(CRITICAL_FILES)('%s must exist', (filePath) => {
    const fullPath = path.join(ROOT, filePath);
    expect(fs.existsSync(fullPath), `CRITICAL FILE MISSING: ${filePath}`).toBe(true);
  });
});

// Verify proxy exports the required function and config
describe('Proxy integrity', () => {
  it('exports proxy function and config matcher', async () => {
    const mod = await import('../proxy');
    expect(mod.proxy).toBeDefined();
    expect(typeof mod.proxy).toBe('function');
    expect(mod.config).toBeDefined();
    expect(mod.config.matcher).toBeDefined();
    expect(Array.isArray(mod.config.matcher)).toBe(true);
  });
});
