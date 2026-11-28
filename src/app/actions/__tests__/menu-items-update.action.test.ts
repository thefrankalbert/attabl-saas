import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Droit de prix (lot 1 des roles): `menu.price` est separe de `menu.edit`.
 *   - modifier un plat SANS toucher au prix: `menu.edit` suffit ;
 *   - le formulaire renvoie toujours `price`/`prices`: un prix INCHANGE passe
 *     sans `menu.price`, mais les champs de prix ne sont pas envoyes au service ;
 *   - un prix CHANGE sans `menu.price`: refus AVANT toute ecriture ;
 *   - creer un plat fixe un prix: `menu.edit` ET `menu.price` ;
 *   - `actionUpdateMenuItemPrice`: `menu.price` seul decide ;
 *   - supplement payant d'un modificateur: `menu.price` en plus.
 * Vraie garde (get-session -> resolveMemberLevels -> POSTE_MATRIX); seuls le
 * client Supabase et les services sont simules.
 */

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/billing/assert-tenant-serving', () => ({
  assertTenantServing: async () => undefined,
  TenantLockedError: class extends Error {},
}));
vi.mock('@/services/storage-cleanup.service', () => ({
  getStorageCleanup: () => ({ imageUrlsOf: async () => [], release: async () => undefined }),
}));

const TENANT = '22222222-2222-4222-a222-222222222222';
const ITEM = '33333333-3333-4333-a333-333333333333';
const CATEGORY = '44444444-4444-4444-a444-444444444444';

const member: { poste: string; custom: Record<string, boolean> | null } = {
  poste: 'cook',
  custom: null,
};

function chain(table: string) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in']) c[m] = vi.fn(() => c);
  // Aucun reglage du restaurant par poste: la matrice par defaut decide.
  if (table === 'poste_permissions') {
    c.then = (ok: (v: { data: never[]; error: null }) => unknown) => ok({ data: [], error: null });
  }
  c.maybeSingle = vi.fn(async () => ({
    data:
      table === 'admin_users'
        ? {
            id: 'admin-1',
            tenant_id: TENANT,
            postes: [member.poste],
            permission_overrides: member.custom,
          }
        : null,
    error: null,
  }));
  return c;
}
const fakeSupabase = {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u-1', email: 'x@y.z' } } })) },
  from: vi.fn((table: string) => chain(table)),
};
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fakeSupabase) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { id: TENANT }, error: null }) }),
      }),
    }),
  }),
}));

const mockGetPrices = vi.fn();
const mockUpdateMenuItem = vi.fn();
const mockUpdatePrice = vi.fn();
const mockCreateMenuItem = vi.fn();
vi.mock('@/services/menu-item.service', () => ({
  createMenuItemService: () => ({
    getPrices: mockGetPrices,
    updateMenuItem: mockUpdateMenuItem,
    updatePrice: mockUpdatePrice,
    createMenuItem: mockCreateMenuItem,
  }),
}));
vi.mock('@/services/plan-enforcement.service', () => ({
  createPlanEnforcementService: () => ({ canAddMenuItem: async () => undefined }),
}));
const mockCreateModifier = vi.fn();
vi.mock('@/services/modifier.service', () => ({
  createModifierService: () => ({ createModifier: mockCreateModifier }),
}));

import {
  actionCreateMenuItem,
  actionUpdateMenuItem,
  actionUpdateMenuItemPrice,
} from '@/app/actions/menu-items';
import { actionCreateModifier } from '@/app/actions/modifiers';

beforeEach(() => {
  vi.clearAllMocks();
  member.poste = 'cook';
  member.custom = null;
  mockGetPrices.mockResolvedValue({ price: 1000, prices: null });
  mockUpdateMenuItem.mockResolvedValue(undefined);
  mockUpdatePrice.mockResolvedValue(undefined);
  mockCreateMenuItem.mockResolvedValue('new-item');
  mockCreateModifier.mockResolvedValue({ id: 'm-1' });
});

/** Cuisinier avec `menu.edit` donne par personne, mais SANS `menu.price`. */
function editorWithoutPrice() {
  member.poste = 'cook';
  member.custom = { 'menu.edit': true };
}

describe('actionUpdateMenuItem: menu.edit suffit hors prix', () => {
  it('sans price ni prices: menu.edit suffit, aucune lecture de prix', async () => {
    editorWithoutPrice();
    const res = await actionUpdateMenuItem(TENANT, ITEM, { name: 'Poulet braise' });
    expect(res.success).toBe(true);
    expect(mockGetPrices).not.toHaveBeenCalled();
    expect(mockUpdateMenuItem).toHaveBeenCalledWith(ITEM, TENANT, { name: 'Poulet braise' });
  });

  it('prix INCHANGE, sans menu.price: passe, les champs de prix ne partent pas', async () => {
    editorWithoutPrice();
    const res = await actionUpdateMenuItem(TENANT, ITEM, { name: 'Poulet', price: 1000 });
    expect(res.success).toBe(true);
    const [, , sent] = mockUpdateMenuItem.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(sent).toEqual({ name: 'Poulet' });
    expect('price' in sent).toBe(false);
    expect('prices' in sent).toBe(false);
  });

  it('prices INCHANGES, sans menu.price: passe, les champs de prix ne partent pas', async () => {
    editorWithoutPrice();
    mockGetPrices.mockResolvedValue({ price: 1000, prices: { EUR: 2 } });
    const res = await actionUpdateMenuItem(TENANT, ITEM, {
      name: 'Poulet',
      price: 1000,
      prices: { EUR: 2 },
    });
    expect(res.success).toBe(true);
    expect(mockUpdateMenuItem).toHaveBeenCalledWith(ITEM, TENANT, { name: 'Poulet' });
  });

  it('prix CHANGE, sans menu.price: refus AVANT toute ecriture', async () => {
    editorWithoutPrice();
    const res = await actionUpdateMenuItem(TENANT, ITEM, { name: 'Poulet', price: 1500 });
    expect(res.error).toBe('permissionDenied');
    expect(res.success).toBeUndefined();
    expect(mockUpdateMenuItem).not.toHaveBeenCalled();
  });

  it('prices CHANGES, sans menu.price: refus AVANT toute ecriture', async () => {
    editorWithoutPrice();
    mockGetPrices.mockResolvedValue({ price: 1000, prices: { EUR: 2 } });
    const res = await actionUpdateMenuItem(TENANT, ITEM, { prices: { EUR: 3 } });
    expect(res.error).toBe('permissionDenied');
    expect(mockUpdateMenuItem).not.toHaveBeenCalled();
  });

  it('temoin: avec menu.price, le MEME prix change part au service', async () => {
    member.poste = 'chef';
    const res = await actionUpdateMenuItem(TENANT, ITEM, { name: 'Poulet', price: 1500 });
    expect(res.success).toBe(true);
    expect(mockUpdateMenuItem).toHaveBeenCalledWith(ITEM, TENANT, { name: 'Poulet', price: 1500 });
  });

  it('sans menu.edit (caissier): refuse meme sans toucher au prix', async () => {
    member.poste = 'cashier';
    const res = await actionUpdateMenuItem(TENANT, ITEM, { name: 'Poulet' });
    expect(res.error).toBe('permissionDenied');
    expect(mockUpdateMenuItem).not.toHaveBeenCalled();
  });
});

describe('actionCreateMenuItem: menu.edit ET menu.price', () => {
  const payload = { name: 'Poulet', price: 1000, category_id: CATEGORY };

  it('chef (les deux droits): cree le plat', async () => {
    member.poste = 'chef';
    const res = await actionCreateMenuItem(TENANT, payload);
    expect(res.itemId).toBe('new-item');
    expect(mockCreateMenuItem).toHaveBeenCalledTimes(1);
  });

  it('menu.edit sans menu.price: refuse, rien n est cree', async () => {
    editorWithoutPrice();
    const res = await actionCreateMenuItem(TENANT, payload);
    expect(res.error).toBe('permissionDenied');
    expect(mockCreateMenuItem).not.toHaveBeenCalled();
  });

  it('menu.price sans menu.edit: refuse, rien n est cree', async () => {
    member.poste = 'cook';
    member.custom = { 'menu.price': true };
    const res = await actionCreateMenuItem(TENANT, payload);
    expect(res.error).toBe('permissionDenied');
    expect(mockCreateMenuItem).not.toHaveBeenCalled();
  });
});

describe('actionUpdateMenuItemPrice: menu.price decide seul', () => {
  it('menu.edit seul: refuse, aucun prix ecrit', async () => {
    editorWithoutPrice();
    const res = await actionUpdateMenuItemPrice(TENANT, ITEM, 1500);
    expect(res.error).toBe('permissionDenied');
    expect(mockUpdatePrice).not.toHaveBeenCalled();
  });

  it('temoin: avec menu.price, le prix est ecrit', async () => {
    member.poste = 'chef';
    const res = await actionUpdateMenuItemPrice(TENANT, ITEM, 1500);
    expect(res.success).toBe(true);
    expect(mockUpdatePrice).toHaveBeenCalledWith(ITEM, 1500, TENANT);
  });
});

describe('actionCreateModifier: un supplement payant exige menu.price', () => {
  const modifier = (price: number) => ({
    tenant_id: TENANT,
    menu_item_id: ITEM,
    name: 'Sauce',
    price,
    is_available: true,
    display_order: 0,
  });

  it('supplement gratuit: menu.edit suffit', async () => {
    editorWithoutPrice();
    const res = await actionCreateModifier(TENANT, modifier(0));
    expect(res.success).toBe(true);
    expect(mockCreateModifier).toHaveBeenCalledTimes(1);
  });

  it('supplement payant sans menu.price: refuse, rien n est cree', async () => {
    editorWithoutPrice();
    const res = await actionCreateModifier(TENANT, modifier(200));
    expect(res.error).toBe('Permissions insuffisantes');
    expect(mockCreateModifier).not.toHaveBeenCalled();
  });

  it('temoin: supplement payant avec menu.price: cree', async () => {
    member.poste = 'chef';
    const res = await actionCreateModifier(TENANT, modifier(200));
    expect(res.success).toBe(true);
    expect(mockCreateModifier).toHaveBeenCalledTimes(1);
  });
});
