import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tenant } from '@/types/admin.types';

/**
 * B74: aucun plan d'aujourd'hui ne plafonne les plats (maxItems = -1 partout),
 * donc la branche "au-dela de la limite" de canAddItems et remainingItemSlots
 * n'etait jamais executee par un test. Une limite de 10 est simulee ici.
 */
vi.mock('@/lib/plans/features', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/plans/features')>();
  return {
    ...actual,
    getPlanLimits: (...args: Parameters<typeof actual.getPlanLimits>) => ({
      ...actual.getPlanLimits(...args),
      maxItems: 10,
    }),
  };
});

import { createPlanEnforcementService } from '../plan-enforcement.service';

function supabaseWithItemCount(count: number | null, error: unknown = null): SupabaseClient {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.is = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve({ count, error });
  return { from: () => chain } as unknown as SupabaseClient;
}

const base: Partial<Tenant> = {
  id: 'tenant-1',
  name: 'Resto',
  slug: 'resto',
  subscription_plan: 'starter',
  subscription_status: 'active',
};
const tenant = base as Tenant;

describe('canAddItems au-dela de la limite (B74)', () => {
  it('accepte un lot qui tient juste dans la limite', async () => {
    const service = createPlanEnforcementService(supabaseWithItemCount(7));
    await expect(service.canAddItems(tenant, 3)).resolves.toBeUndefined();
  });

  it('refuse un lot qui depasse, en citant les emplacements restants', async () => {
    const service = createPlanEnforcementService(supabaseWithItemCount(7));
    await expect(service.canAddItems(tenant, 4)).rejects.toMatchObject({
      code: 'VALIDATION',
      message: expect.stringContaining('Il vous reste 3 emplacement'),
    });
  });

  it('une lecture en erreur est une panne, pas un feu vert', async () => {
    const service = createPlanEnforcementService(supabaseWithItemCount(null, { code: 'x' }));
    await expect(service.canAddItems(tenant, 1)).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});

describe('remainingItemSlots (B74)', () => {
  it('rend les emplacements restants, jamais negatifs', async () => {
    await expect(
      createPlanEnforcementService(supabaseWithItemCount(4)).remainingItemSlots(tenant),
    ).resolves.toBe(6);
    await expect(
      createPlanEnforcementService(supabaseWithItemCount(12)).remainingItemSlots(tenant),
    ).resolves.toBe(0);
  });

  it('une lecture en erreur leve INTERNAL', async () => {
    await expect(
      createPlanEnforcementService(supabaseWithItemCount(null, { code: 'x' })).remainingItemSlots(
        tenant,
      ),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});
