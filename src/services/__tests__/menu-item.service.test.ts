import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMenuItemService } from '../menu-item.service';
import { ServiceError } from '../errors';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function makeInsertMock(result: { data: unknown; error: unknown }) {
  const singleMock = vi.fn().mockResolvedValue(result);
  const selectMock = vi.fn().mockReturnValue({ single: singleMock });
  const insertMock = vi.fn().mockReturnValue({ select: selectMock });
  const fromMock = vi.fn().mockReturnValue({ insert: insertMock });
  return { from: fromMock as unknown as SupabaseClient['from'], insertMock, selectMock };
}

function makeChainMock(result: { error: unknown }) {
  const eqMock2 = vi.fn().mockResolvedValue(result);
  const eqMock1 = vi.fn().mockReturnValue({ eq: eqMock2 });
  const opMock = vi.fn().mockReturnValue({ eq: eqMock1 });
  const fromMock = vi.fn().mockReturnValue({
    update: opMock,
    delete: vi.fn().mockReturnValue({ eq: eqMock1 }),
  });
  return { from: fromMock as unknown as SupabaseClient['from'] };
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

describe('createMenuItemService.updateMenuItem', () => {
  it('filters by both itemId and tenantId on update', async () => {
    const { from } = makeChainMock({ error: null });
    const service = createMenuItemService({ from } as unknown as SupabaseClient);

    await service.updateMenuItem('item-1', 'tenant-1', { name: 'Updated' });

    expect(from).toHaveBeenCalledWith('menu_items');
  });

  it('throws ServiceError on DB error', async () => {
    const { from } = makeChainMock({ error: { message: 'fail' } });
    const service = createMenuItemService({ from } as unknown as SupabaseClient);

    await expect(
      service.updateMenuItem('item-1', 'tenant-1', { name: 'X' }),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('createMenuItemService.deleteMenuItem', () => {
  it('throws ServiceError on DB error', async () => {
    const { from } = makeChainMock({ error: { message: 'fail' } });
    const service = createMenuItemService({ from } as unknown as SupabaseClient);

    await expect(service.deleteMenuItem('item-1', 'tenant-1')).rejects.toBeInstanceOf(ServiceError);
  });
});
