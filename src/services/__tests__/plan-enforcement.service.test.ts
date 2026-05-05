import { describe, it, expect, vi } from 'vitest';
import { createPlanEnforcementService } from '../plan-enforcement.service';
import { ServiceError } from '../errors';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tenant } from '@/types/admin.types';

/**
 * Creates a chainable mock that resolves to the given result when awaited.
 * Supports any number of chained .select().eq().eq() calls.
 */
function chainable(result: { count?: number | null; error?: unknown; data?: unknown }) {
  const obj: Record<string, unknown> = {};
  // Every method returns the same chainable object
  obj.select = vi.fn(() => obj);
  obj.eq = vi.fn(() => obj);
  obj.in = vi.fn(() => obj);
  obj.single = vi.fn(() => Promise.resolve(result));
  // Make the chain itself thenable (await-able)
  obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

function createMockSupabase(
  tableResults: Record<string, { count?: number | null; error?: unknown }>,
) {
  const tableChains: Record<string, ReturnType<typeof chainable>> = {};
  for (const [table, result] of Object.entries(tableResults)) {
    tableChains[table] = chainable(result);
  }

  return {
    from: vi.fn((table: string) => tableChains[table] || chainable({ count: 0, error: null })),
  } as unknown as SupabaseClient;
}

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-1',
    name: 'Test Restaurant',
    slug: 'test-restaurant',
    subscription_plan: 'starter',
    subscription_status: 'active',
    trial_ends_at: null,
    ...overrides,
  } as Tenant;
}

describe('canAddAdmin', () => {
  it('allows when under limit', async () => {
    const supabase = createMockSupabase({
      admin_users: { count: 0, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddAdmin(makeTenant())).resolves.toBeUndefined();
  });

  it('throws VALIDATION when limit reached (starter = 1)', async () => {
    const supabase = createMockSupabase({
      admin_users: { count: 1, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddAdmin(makeTenant())).rejects.toThrow(ServiceError);
  });

  it('uses pro limits during active trial', async () => {
    const trialTenant = makeTenant({
      subscription_status: 'trial',
      trial_ends_at: new Date(Date.now() + 86400000).toISOString(),
    });
    // Pro allows 2 admins, so 0 should be fine
    const supabase = createMockSupabase({
      admin_users: { count: 0, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddAdmin(trialTenant)).resolves.toBeUndefined();
  });

  it('throws INTERNAL on database error', async () => {
    const supabase = createMockSupabase({
      admin_users: { count: null, error: { message: 'DB error' } },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddAdmin(makeTenant())).rejects.toThrow('vérification des limites');
  });
});

describe('canAddMenuItem', () => {
  it('never throws for starter (maxItems = -1, unlimited)', async () => {
    const supabase = createMockSupabase({
      menu_items: { count: 10000, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddMenuItem(makeTenant())).resolves.toBeUndefined();
  });

  it('allows when under limit', async () => {
    const supabase = createMockSupabase({
      menu_items: { count: 25, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddMenuItem(makeTenant())).resolves.toBeUndefined();
  });
});

describe('canAddStaff', () => {
  it('allows when under limit (starter = 3, count = 2)', async () => {
    const supabase = createMockSupabase({
      admin_users: { count: 2, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddStaff(makeTenant())).resolves.toBeUndefined();
  });

  it('throws VALIDATION when limit reached (starter = 3, count = 3)', async () => {
    const supabase = createMockSupabase({
      admin_users: { count: 3, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddStaff(makeTenant())).rejects.toThrow(ServiceError);
  });

  it('pro limit = 15, count = 15 throws', async () => {
    const supabase = createMockSupabase({
      admin_users: { count: 15, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddStaff(makeTenant({ subscription_plan: 'pro' }))).rejects.toThrow(
      ServiceError,
    );
  });

  it('business maxStaff = -1 -> never throws even at 500 staff', async () => {
    const supabase = createMockSupabase({
      admin_users: { count: 500, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(
      service.canAddStaff(makeTenant({ subscription_plan: 'business' })),
    ).resolves.toBeUndefined();
  });

  it('enterprise maxStaff = -1 -> never throws', async () => {
    const supabase = createMockSupabase({
      admin_users: { count: 9999, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(
      service.canAddStaff(makeTenant({ subscription_plan: 'enterprise' })),
    ).resolves.toBeUndefined();
  });

  it('throws INTERNAL on database error', async () => {
    const supabase = createMockSupabase({
      admin_users: { count: null, error: { message: 'DB error' } },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddStaff(makeTenant())).rejects.toThrow('vérification des limites');
  });
});

describe('canAddVenue', () => {
  it('throws when venue limit reached (starter = 1)', async () => {
    const supabase = createMockSupabase({
      venues: { count: 1, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddVenue(makeTenant())).rejects.toThrow(ServiceError);
  });
});

describe('canAddMenu', () => {
  it('never throws for starter (maxMenus = -1, unlimited)', async () => {
    const supabase = createMockSupabase({
      menus: { count: 999, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddMenu(makeTenant())).resolves.toBeUndefined();
  });
});

describe('unlimited limits (-1 guard)', () => {
  it('starter maxItems = -1 -> canAddMenuItem never throws even at 10000 items', async () => {
    const supabase = createMockSupabase({
      menu_items: { count: 10000, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddMenuItem(makeTenant())).resolves.toBeUndefined();
  });

  it('business maxAdmins = -1 -> canAddAdmin never throws', async () => {
    const supabase = createMockSupabase({
      admin_users: { count: 500, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(
      service.canAddAdmin(makeTenant({ subscription_plan: 'business' })),
    ).resolves.toBeUndefined();
  });

  it('enterprise -> canAddVenue never throws (maxVenues = -1)', async () => {
    const supabase = createMockSupabase({
      venues: { count: 9999, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(
      service.canAddVenue(makeTenant({ subscription_plan: 'enterprise' })),
    ).resolves.toBeUndefined();
  });

  it('starter maxCategories = -1 -> canAddCategory never throws', async () => {
    const supabase = createMockSupabase({
      categories: { count: 10000, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddCategory(makeTenant())).resolves.toBeUndefined();
  });

  it('starter maxItems = -1 -> canAddItems batch never throws', async () => {
    const supabase = createMockSupabase({
      menu_items: { count: 10000, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddItems(makeTenant(), 500)).resolves.toBeUndefined();
  });

  it('starter maxCategories = -1 -> canAddCategories batch never throws', async () => {
    const supabase = createMockSupabase({
      categories: { count: 10000, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    await expect(service.canAddCategories(makeTenant(), 100)).resolves.toBeUndefined();
  });
});

describe('getUsageCounts', () => {
  it('returns counts from all tables', async () => {
    const supabase = createMockSupabase({
      admin_users: { count: 2, error: null },
      menu_items: { count: 50, error: null },
      venues: { count: 1, error: null },
      menus: { count: 3, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    const result = await service.getUsageCounts('tenant-1');
    expect(result).toEqual({ admins: 2, items: 50, venues: 1, menus: 3, categories: 0 });
  });

  it('handles null counts gracefully', async () => {
    const supabase = createMockSupabase({
      admin_users: { count: null, error: null },
      menu_items: { count: null, error: null },
      venues: { count: null, error: null },
      menus: { count: null, error: null },
    });
    const service = createPlanEnforcementService(supabase);
    const result = await service.getUsageCounts('tenant-1');
    expect(result).toEqual({ admins: 0, items: 0, venues: 0, menus: 0, categories: 0 });
  });
});
