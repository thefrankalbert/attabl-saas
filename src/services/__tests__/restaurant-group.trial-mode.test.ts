import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRestaurantGroupService } from '../restaurant-group.service';

function clientReturning(data: unknown): SupabaseClient {
  return { rpc: () => Promise.resolve({ data, error: null }) } as unknown as SupabaseClient;
}

const input = {
  groupId: 'g1',
  userId: 'u1',
  email: 'a@b.c',
  name: 'N',
  slug: 'n',
  type: 'restaurant',
  plan: 'trial',
};

describe('addRestaurantToGroup: trialMode (P-05)', () => {
  it('transmet "none" quand la base refuse l essai', async () => {
    const svc = createRestaurantGroupService(
      clientReturning({ tenantId: 't', slug: 'n', trialMode: 'none' }),
    );
    expect((await svc.addRestaurantToGroup(input)).trialMode).toBe('none');
  });

  it('transmet "shared" tel quel', async () => {
    const svc = createRestaurantGroupService(
      clientReturning({ tenantId: 't', slug: 'n', trialMode: 'shared' }),
    );
    expect((await svc.addRestaurantToGroup(input)).trialMode).toBe('shared');
  });

  it('temoin: une valeur absente ou inconnue ne declenche PAS le message d abonnement', async () => {
    const svc = createRestaurantGroupService(
      clientReturning({ tenantId: 't', slug: 'n', trialMode: 'bidon' }),
    );
    expect((await svc.addRestaurantToGroup(input)).trialMode).toBe('started');
  });
});
