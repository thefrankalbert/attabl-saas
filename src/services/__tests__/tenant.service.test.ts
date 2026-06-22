import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTenantService } from '../tenant.service';

function mockSupabase() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { client: { from } as unknown as SupabaseClient, update, eq, from };
}

const base = {
  name: 'Resto',
  primaryColor: '#000000',
  secondaryColor: '#FFFFFF',
} as const;

describe('tenant.service updateSettings (partial PATCH)', () => {
  it('writes only the provided fields on a partial save (no clobber)', async () => {
    const { client, update, eq } = mockSupabase();

    await createTenantService(client).updateSettings('tenant-1', {
      ...base,
      customDomain: 'shop.example.com',
    });

    const payload = update.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ['custom_domain', 'name', 'primary_color', 'secondary_color', 'updated_at'].sort(),
    );
    // The bug: these unrelated columns must NOT be written on a partial save.
    expect(payload).not.toHaveProperty('currency');
    expect(payload).not.toHaveProperty('tax_rate');
    expect(payload).not.toHaveProperty('enable_tax');
    expect(payload).not.toHaveProperty('supported_currencies');
    expect(payload.custom_domain).toBe('shop.example.com');
    expect(eq).toHaveBeenCalledWith('id', 'tenant-1');
  });

  it('writes every provided field on a full save', async () => {
    const { client, update } = mockSupabase();

    await createTenantService(client).updateSettings('tenant-1', {
      ...base,
      currency: 'EUR',
      enableTax: true,
      taxRate: 20,
      enableCoupons: true,
      idleTimeoutMinutes: null,
    });

    const payload = update.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.currency).toBe('EUR');
    expect(payload.enable_tax).toBe(true);
    expect(payload.tax_rate).toBe(20);
    expect(payload.enable_coupons).toBe(true);
    // null is a real value (timeout disabled) and must be written
    expect(payload).toHaveProperty('idle_timeout_minutes', null);
  });

  it('skips idle_timeout_minutes entirely when it is undefined', async () => {
    const { client, update } = mockSupabase();

    await createTenantService(client).updateSettings('tenant-1', { ...base });

    const payload = update.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('idle_timeout_minutes');
  });

  it('rejects an invalid hex color before any write', async () => {
    const { client, update } = mockSupabase();

    await expect(
      createTenantService(client).updateSettings('tenant-1', { ...base, primaryColor: 'red' }),
    ).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
});
