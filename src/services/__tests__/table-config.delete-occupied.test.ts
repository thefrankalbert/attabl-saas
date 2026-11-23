import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// Revue L015 (A17): supprimer une table (ou sa zone) qui a une session ouverte
// detachait ses commandes (orders.table_id ON DELETE SET NULL) sans fermer la
// session. La suppression doit etre refusee tant que la table est occupee.

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../table-config.guards', () => ({
  createTableConfigGuards: () => ({
    assertVenueOwnedByTenant: vi.fn(),
    assertZoneOwnedByTenant: vi.fn(),
    assertTableOwnedByTenant: vi.fn(),
  }),
}));

import { createTableConfigService } from '../table-config.service';

const TENANT = 'tenant-A';
const state = {
  openSessions: [] as Array<{ id: string }>,
  deleted: [] as string[],
  sessionFilters: [] as Array<[string, unknown]>,
};

function makeSupabase(): SupabaseClient {
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (c: string, v: unknown) => {
      filters.push([c, v]);
      return chain;
    };
    chain.in = (c: string, v: unknown) => {
      filters.push([c, v]);
      return chain;
    };
    chain.limit = async () => {
      state.sessionFilters = filters;
      return { data: state.openSessions, error: null };
    };
    chain.delete = () => ({
      eq: async () => {
        state.deleted.push(table);
        return { error: null };
      },
    });
    chain.then = (ok: (v: unknown) => unknown) =>
      ok({ data: [{ table_number: 'INT-1' }], error: null });
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

describe('table-config: suppression d une table occupee', () => {
  beforeEach(() => {
    state.openSessions = [];
    state.deleted = [];
    state.sessionFilters = [];
  });

  it('table avec une session ouverte: CONFLICT, rien n est supprime', async () => {
    state.openSessions = [{ id: 's-1' }];
    const service = createTableConfigService(makeSupabase());
    await expect(service.deleteTable(TENANT, 'table-1')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(state.deleted).toEqual([]);
    expect(state.sessionFilters).toContainEqual(['tenant_id', TENANT]);
    expect(state.sessionFilters).toContainEqual(['table_number', ['INT-1']]);
  });

  it('zone dont une table est occupee: CONFLICT, rien n est supprime', async () => {
    state.openSessions = [{ id: 's-1' }];
    const service = createTableConfigService(makeSupabase());
    await expect(service.deleteZone(TENANT, 'zone-1')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(state.deleted).toEqual([]);
  });

  it('temoin: table libre, la suppression a lieu', async () => {
    const service = createTableConfigService(makeSupabase());
    await service.deleteTable(TENANT, 'table-1');
    expect(state.deleted).toEqual(['tables']);
  });
});
