import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMenuItemService } from '../menu-item.service';
import { ServiceError } from '../errors';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Le controle de doublon est teste a part (duplicate-name.test.ts).
vi.mock('../duplicate-name', () => ({ assertNameAvailable: vi.fn() }));

function makeInsertMock(result: { data: unknown; error: unknown }) {
  const singleMock = vi.fn().mockResolvedValue(result);
  const selectMock = vi.fn().mockReturnValue({ single: singleMock });
  const insertMock = vi.fn().mockReturnValue({ select: selectMock });
  const fromMock = vi.fn().mockReturnValue({ insert: insertMock });
  return { from: fromMock as unknown as SupabaseClient['from'], insertMock, selectMock };
}

describe('createMenuItemService.createMenuItem', () => {
  it('inserts payload merged with tenantId and returns created item id', async () => {
    const { from, insertMock } = makeInsertMock({ data: { id: 'item-abc' }, error: null });
    const service = createMenuItemService({ from } as unknown as SupabaseClient);

    const id = await service.createMenuItem('tenant-123', { name: 'Burger', price: 5000 });

    expect(from).toHaveBeenCalledWith('menu_items');
    expect(insertMock).toHaveBeenCalledWith([
      { name: 'Burger', price: 5000, tenant_id: 'tenant-123' },
    ]);
    expect(id).toBe('item-abc');
  });

  it('forces tenant_id to tenantId even when payload carries a different value', async () => {
    const { from, insertMock } = makeInsertMock({ data: { id: 'item-abc' }, error: null });
    const service = createMenuItemService({ from } as unknown as SupabaseClient);

    await service.createMenuItem('real-tenant', { name: 'Burger', tenant_id: 'evil-tenant' });

    const inserted = (insertMock.mock.calls[0] as unknown[][])[0][0] as Record<string, unknown>;
    expect(inserted.tenant_id).toBe('real-tenant');
    expect(inserted.tenant_id).not.toBe('evil-tenant');
  });

  it('throws ServiceError when Supabase returns an error', async () => {
    const { from } = makeInsertMock({ data: null, error: { message: 'DB error', code: '23505' } });
    const service = createMenuItemService({ from } as unknown as SupabaseClient);

    await expect(service.createMenuItem('tenant-123', { name: 'Burger' })).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it('throws ServiceError when RLS silently blocks the insert (null data, no error)', async () => {
    const { from } = makeInsertMock({ data: null, error: null });
    const service = createMenuItemService({ from } as unknown as SupabaseClient);

    await expect(service.createMenuItem('tenant-123', { name: 'Burger' })).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it('throws ServiceError with VALIDATION code when tenantId is empty', async () => {
    const { from } = makeInsertMock({ data: { id: 'x' }, error: null });
    const service = createMenuItemService({ from } as unknown as SupabaseClient);

    const err = await service.createMenuItem('', { name: 'Burger' }).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).code).toBe('VALIDATION');
  });
});

/**
 * Chainable builder: every call is recorded; awaiting it (or maybeSingle)
 * resolves the next queued result for that operation (read = select, write =
 * update).
 */
function makeUpdateMock(results: {
  read?: { data: unknown; error: unknown };
  write: { error: unknown; count?: number | null };
}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const from = vi.fn(() => {
    let op: 'read' | 'write' = 'read';
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'update', 'eq', 'is']) {
      b[m] = vi.fn((...args: unknown[]) => {
        calls.push([m, ...args]);
        if (m === 'update') op = 'write';
        return b;
      });
    }
    b.maybeSingle = vi.fn(async () => results.read);
    b.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve(op === 'write' ? results.write : results.read).then(ok);
    return b;
  });
  return { client: { from } as unknown as SupabaseClient, calls, from };
}

describe('createMenuItemService.updateMenuItem', () => {
  it('filters by both itemId and tenantId and asks Postgres to count the rows', async () => {
    const { client, calls } = makeUpdateMock({ write: { error: null, count: 1 } });
    const service = createMenuItemService(client);

    await service.updateMenuItem('item-1', 'tenant-1', { price: 1500 });

    expect(calls).toContainEqual(['update', { price: 1500 }, { count: 'exact' }]);
    expect(calls).toContainEqual(['eq', 'id', 'item-1']);
    expect(calls).toContainEqual(['eq', 'tenant_id', 'tenant-1']);
  });

  it('B56: un plat supprime entre-temps (0 ligne) est introuvable, pas "enregistre"', async () => {
    const { client } = makeUpdateMock({ write: { error: null, count: 0 } });
    const service = createMenuItemService(client);

    await expect(
      service.updateMenuItem('item-1', 'tenant-1', { price: 1500 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('B33: un renommage controle le doublon dans la categorie, sans compter le plat', async () => {
    const { assertNameAvailable } = await import('../duplicate-name');
    vi.mocked(assertNameAvailable).mockClear();
    const { client } = makeUpdateMock({ write: { error: null, count: 1 } });
    const service = createMenuItemService(client);

    await service.updateMenuItem('item-1', 'tenant-1', { name: 'Poulet', category_id: 'cat-1' });

    expect(assertNameAvailable).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        table: 'menu_items',
        tenantId: 'tenant-1',
        name: 'Poulet',
        scope: { column: 'category_id', value: 'cat-1' },
        excludeId: 'item-1',
        excludeSoftDeleted: true,
      }),
    );
  });

  it('B33: sans categorie envoyee, compare dans la categorie actuelle du plat', async () => {
    const { assertNameAvailable } = await import('../duplicate-name');
    vi.mocked(assertNameAvailable).mockClear();
    const { client, calls } = makeUpdateMock({
      read: { data: { category_id: 'cat-9' }, error: null },
      write: { error: null, count: 1 },
    });
    const service = createMenuItemService(client);

    await service.updateMenuItem('item-1', 'tenant-1', { name: 'Poulet' });

    expect(calls).toContainEqual(['select', 'category_id']);
    expect(assertNameAvailable).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ scope: { column: 'category_id', value: 'cat-9' } }),
    );
  });

  it('B33: renommer un plat d un autre restaurant ou supprime: introuvable, rien ecrit', async () => {
    const { client, calls } = makeUpdateMock({
      read: { data: null, error: null },
      write: { error: null, count: 1 },
    });
    const service = createMenuItemService(client);

    await expect(
      service.updateMenuItem('item-1', 'tenant-1', { name: 'Poulet' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(calls.some(([m]) => m === 'update')).toBe(false);
  });

  it('throws ServiceError on DB error', async () => {
    const { client } = makeUpdateMock({ write: { error: { message: 'fail' } } });
    const service = createMenuItemService(client);

    await expect(service.updateMenuItem('item-1', 'tenant-1', { price: 10 })).rejects.toMatchObject(
      { code: 'INTERNAL' },
    );
  });
});

describe('createMenuItemService.deleteMenuItem', () => {
  it('soft-deletes by updating deleted_at instead of hard delete', async () => {
    const isMock = vi.fn().mockResolvedValue({ error: null });
    const eqTenantMock = vi.fn().mockReturnValue({ is: isMock });
    const eqIdMock = vi.fn().mockReturnValue({ eq: eqTenantMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqIdMock });
    const fromMock = vi.fn().mockReturnValue({ update: updateMock });
    const service = createMenuItemService({ from: fromMock } as unknown as SupabaseClient);

    await service.deleteMenuItem('item-1', 'tenant-1');

    expect(fromMock).toHaveBeenCalledWith('menu_items');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted_at: expect.any(String),
        is_available: false,
      }),
      { count: 'exact' },
    );
    expect(isMock).toHaveBeenCalledWith('deleted_at', null);
  });

  it('throws ServiceError on DB error', async () => {
    const isMock = vi.fn().mockResolvedValue({ error: { message: 'fail' } });
    const eqTenantMock = vi.fn().mockReturnValue({ is: isMock });
    const eqIdMock = vi.fn().mockReturnValue({ eq: eqTenantMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqIdMock });
    const fromMock = vi.fn().mockReturnValue({ update: updateMock });
    const service = createMenuItemService({ from: fromMock } as unknown as SupabaseClient);

    await expect(service.deleteMenuItem('item-1', 'tenant-1')).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('createMenuItemService.createMenuItem - doublon', () => {
  it('refuse un nom deja pris dans la categorie sans rien inserer', async () => {
    const { assertNameAvailable } = await import('../duplicate-name');
    vi.mocked(assertNameAvailable).mockRejectedValueOnce(
      new ServiceError('Un plat porte deja ce nom dans cette categorie.', 'VALIDATION'),
    );
    const from = vi.fn();
    const service = createMenuItemService({ from } as unknown as SupabaseClient);
    await expect(
      service.createMenuItem('tenant-A', { name: 'Poulet', category_id: 'cat-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(from).not.toHaveBeenCalled();
  });
});
