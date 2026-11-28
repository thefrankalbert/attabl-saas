import { describe, it, expect } from 'vitest';
import { canOpenAdminSubPath } from '../admin-route-permissions';
import { getEffectiveLevels, NO_LEVELS } from '@/lib/permissions';

describe('canOpenAdminSubPath - orders', () => {
  it('cache les commandes a qui ne prend, ne suit ni n encaisse', () => {
    expect(canOpenAdminSubPath('/orders', NO_LEVELS)).toBe(false);
    expect(canOpenAdminSubPath('/orders/abc', NO_LEVELS)).toBe(false);
    const stripped = getEffectiveLevels({
      postes: ['waiter'],
      permission_overrides: { 'orders.take': false },
    });
    expect(canOpenAdminSubPath('/orders', stripped)).toBe(false);
  });

  it('les ouvre a qui detient un seul des trois droits', () => {
    expect(canOpenAdminSubPath('/orders', getEffectiveLevels({ postes: ['waiter'] }))).toBe(true);
    expect(canOpenAdminSubPath('/orders', getEffectiveLevels({ postes: ['cook'] }))).toBe(true);
  });

  it('garde l accueil ouvert a tout membre', () => {
    expect(canOpenAdminSubPath('', NO_LEVELS)).toBe(true);
  });
});
