import { describe, it, expect, vi, beforeEach } from 'vitest';

// Revue L015 (A16): le formulaire bornait le numero de table, la capacite (20)
// et le lot (50 tables), pas les actions serveur. Une requete forgee creait la
// table `T R/?#1` (URL du QR cassee), 1 000 000 de places, ou 5 000 tables.

vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserForTenant: vi.fn(async () => ({ supabase: {} })),
  AuthError: class AuthError extends Error {},
}));
vi.mock('@/lib/billing/assert-tenant-serving', () => ({
  assertTenantServing: vi.fn(),
  TenantLockedError: class TenantLockedError extends Error {},
}));
vi.mock('@/lib/plans/assert-feature', () => ({ isFeatureEntitled: vi.fn(async () => true) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }));

const { mockInsert, mockCapacity } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockCapacity: vi.fn(),
}));
vi.mock('@/services/table-config.service', () => ({
  createTableConfigService: () => ({
    insertTables: mockInsert,
    updateTableCapacity: mockCapacity,
  }),
}));

import { actionInsertTables, actionUpdateTableCapacity } from '@/app/actions/tables';

const T = '22222222-2222-4222-a222-222222222222';
const Z = '44444444-4444-4444-a444-444444444444';
const TABLE = '55555555-5555-4555-a555-555555555555';
const row = (over: Record<string, unknown> = {}) => ({
  zone_id: Z,
  table_number: 'INT-1',
  display_name: 'Table 1',
  capacity: 4,
  is_active: true,
  ...over,
});

describe('actions tables: memes bornes que le formulaire', () => {
  beforeEach(() => vi.clearAllMocks());

  it('temoin: une table valide est inseree', async () => {
    expect(await actionInsertTables(T, [row()])).toEqual({ success: true });
    expect(mockInsert).toHaveBeenCalled();
  });

  it.each([
    ['numero avec ponctuation', row({ table_number: 'T R/?#1' })],
    ['capacite sans plafond', row({ capacity: 1_000_000 })],
  ])('%s: refuse, rien n est insere', async (_cas, bad) => {
    const res = await actionInsertTables(T, [bad as ReturnType<typeof row>]);
    expect(res.error).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('lot de 51 tables: refuse, rien n est insere', async () => {
    const lot = Array.from({ length: 51 }, (_, i) => row({ table_number: `INT-${i + 1}` }));
    expect((await actionInsertTables(T, lot)).error).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('capacite 21 en modification: refusee', async () => {
    expect((await actionUpdateTableCapacity(T, TABLE, 21)).error).toBeDefined();
    expect(mockCapacity).not.toHaveBeenCalled();
  });
});
