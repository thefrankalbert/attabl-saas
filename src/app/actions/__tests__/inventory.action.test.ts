import { describe, it, expect, vi, beforeEach } from 'vitest';

// Coupure du restaurant (A-02): la garde est simulee ici, sa logique est testee
// dans lib/billing/__tests__/assert-tenant-serving.test.ts.
const { mockAssertServing } = vi.hoisted(() => ({ mockAssertServing: vi.fn() }));
vi.mock('@/lib/billing/assert-tenant-serving', async () => {
  const { AuthError } = await import('@/lib/auth/get-session');
  class TenantLockedError extends AuthError {
    constructor(message = 'Ce restaurant est temporairement indisponible') {
      super(message, 403);
    }
  }
  return { assertTenantServing: mockAssertServing, TenantLockedError };
});

// --- Mocks -----------------------------------------------------
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

class MockAuthError extends Error {
  status: number;
  constructor(status: number) {
    super('auth');
    this.status = status;
  }
}
const mockGetAuthUserForTenant = vi.fn();
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserForTenant: (...args: unknown[]) => mockGetAuthUserForTenant(...args),
  AuthError: MockAuthError,
}));

const mockRecordLoss = vi.fn<() => Promise<void>>();
const mockGetLossesByReason = vi.fn<() => Promise<unknown[]>>();
const mockReceiveStock = vi.fn<() => Promise<void>>();
const mockAdjustStock = vi.fn<() => Promise<void>>();
const mockSetOpeningStock = vi.fn<() => Promise<void>>();
vi.mock('@/services/inventory.service', () => ({
  createInventoryService: vi.fn(() => ({
    recordLoss: mockRecordLoss,
    getLossesByReason: mockGetLossesByReason,
    receiveStock: mockReceiveStock,
    adjustStock: mockAdjustStock,
    setOpeningStock: mockSetOpeningStock,
  })),
}));

const TENANT_ID = '22222222-2222-4222-a222-222222222222';
const INGREDIENT_ID = '33333333-3333-4333-a333-333333333333';

/**
 * Client Supabase minimal servant la ligne `tenants` que lit la garde de plan.
 * Le module Inventaire est Pro: sans abonnement entitlant, l'action doit refuser
 * AVANT d'appeler le service, meme si le role et la permission sont bons.
 */
function supabaseOnPlan(plan: string, status = 'active') {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { subscription_plan: plan, subscription_status: status, trial_ends_at: null },
          }),
        }),
      }),
    }),
  };
}

const validInput = {
  ingredient_id: INGREDIENT_ID,
  quantity: 3,
  reason_code: 'breakage' as const,
  notes: 'dropped',
};

describe('actionRecordLoss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUserForTenant.mockResolvedValue({
      supabase: supabaseOnPlan('pro'),
      user: { id: 'user-9' },
    });
    mockRecordLoss.mockResolvedValue(undefined);
  });

  it('rejects an invalid reason_code before touching the service', async () => {
    const { actionRecordLoss } = await import('@/app/actions/inventory');
    const result = await actionRecordLoss(TENANT_ID, {
      ...validInput,
      // @ts-expect-error - deliberately invalid reason for the negative test
      reason_code: 'recount',
    });

    expect(result).toEqual({ error: 'Motif de perte invalide.' });
    expect(mockRecordLoss).not.toHaveBeenCalled();
  });

  it('rejects a non-positive quantity', async () => {
    const { actionRecordLoss } = await import('@/app/actions/inventory');
    const result = await actionRecordLoss(TENANT_ID, { ...validInput, quantity: 0 });

    expect(result).toEqual({ error: 'La quantité doit être supérieure à 0.' });
    expect(mockRecordLoss).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid ingredient_id', async () => {
    const { actionRecordLoss } = await import('@/app/actions/inventory');
    const result = await actionRecordLoss(TENANT_ID, {
      ...validInput,
      ingredient_id: 'not-a-uuid',
    });

    expect(result).toEqual({ error: 'Élément introuvable. Rechargez la page et réessayez.' });
    expect(mockRecordLoss).not.toHaveBeenCalled();
  });

  it('returns a permission error when the caller lacks inventory access', async () => {
    mockGetAuthUserForTenant.mockRejectedValue(new MockAuthError(403));

    const { actionRecordLoss } = await import('@/app/actions/inventory');
    const result = await actionRecordLoss(TENANT_ID, validInput);

    expect(result).toEqual({ error: 'Permissions insuffisantes' });
    expect(mockRecordLoss).not.toHaveBeenCalled();
  });

  it('records the loss on the happy path', async () => {
    const { actionRecordLoss } = await import('@/app/actions/inventory');
    const result = await actionRecordLoss(TENANT_ID, validInput);

    expect(result).toEqual({ success: true });
    expect(mockRecordLoss).toHaveBeenCalledWith(TENANT_ID, validInput);
  });

  it('WRITE stays gated at inventory.edit, decided by the permission alone', async () => {
    const { actionRecordLoss } = await import('@/app/actions/inventory');
    await actionRecordLoss(TENANT_ID, validInput);

    expect(mockGetAuthUserForTenant).toHaveBeenCalledWith(
      TENANT_ID,
      // Plus de liste de roles avant la permission: le reglage du
      // proprietaire (inventory.edit) decide seul (X9).
      ['owner', 'admin', 'manager', 'cashier', 'chef', 'waiter'],
      'inventory.edit',
    );
  });
});

describe('actionReceiveStock (WRITE gated at inventory.edit)', () => {
  const validReceive = { ingredient_id: INGREDIENT_ID, quantity: 2, inPurchaseUnit: true };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUserForTenant.mockResolvedValue({
      supabase: supabaseOnPlan('pro'),
      user: { id: 'user-9' },
    });
    mockReceiveStock.mockResolvedValue(undefined);
  });

  it('rejects a non-positive quantity before touching the service', async () => {
    const { actionReceiveStock } = await import('@/app/actions/inventory');
    const result = await actionReceiveStock(TENANT_ID, { ...validReceive, quantity: 0 });

    expect(result).toEqual({ error: 'La quantité doit être supérieure à 0.' });
    expect(mockReceiveStock).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean inPurchaseUnit', async () => {
    const { actionReceiveStock } = await import('@/app/actions/inventory');
    const result = await actionReceiveStock(TENANT_ID, {
      ...validReceive,
      // @ts-expect-error - deliberately wrong type for the negative test
      inPurchaseUnit: 'yes',
    });

    expect(result).toEqual({ error: "Choix d'unité invalide." });
    expect(mockReceiveStock).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid ingredient_id', async () => {
    const { actionReceiveStock } = await import('@/app/actions/inventory');
    const result = await actionReceiveStock(TENANT_ID, {
      ...validReceive,
      ingredient_id: 'nope',
    });

    expect(result).toEqual({ error: 'Élément introuvable. Rechargez la page et réessayez.' });
    expect(mockReceiveStock).not.toHaveBeenCalled();
  });

  it('receives on the happy path and stays gated at inventory.edit', async () => {
    const { actionReceiveStock } = await import('@/app/actions/inventory');
    const result = await actionReceiveStock(TENANT_ID, validReceive);

    expect(result).toEqual({ success: true });
    expect(mockReceiveStock).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        ingredient_id: INGREDIENT_ID,
        quantity: 2,
        inPurchaseUnit: true,
      }),
    );
    expect(mockGetAuthUserForTenant).toHaveBeenCalledWith(
      TENANT_ID,
      // Plus de liste de roles avant la permission: le reglage du
      // proprietaire (inventory.edit) decide seul (X9).
      ['owner', 'admin', 'manager', 'cashier', 'chef', 'waiter'],
      'inventory.edit',
    );
  });

  it('accepts and forwards supplier_id + notes (validated payload)', async () => {
    const { actionReceiveStock } = await import('@/app/actions/inventory');
    const result = await actionReceiveStock(TENANT_ID, {
      ...validReceive,
      supplier_id: INGREDIENT_ID,
      notes: 'livraison du matin',
    });

    expect(result).toEqual({ success: true });
    expect(mockReceiveStock).toHaveBeenCalledWith(TENANT_ID, {
      ingredient_id: INGREDIENT_ID,
      quantity: 2,
      inPurchaseUnit: true,
      supplier_id: INGREDIENT_ID,
      notes: 'livraison du matin',
    });
  });

  it('rejects a non-uuid supplier_id', async () => {
    const { actionReceiveStock } = await import('@/app/actions/inventory');
    const result = await actionReceiveStock(TENANT_ID, {
      ...validReceive,
      supplier_id: 'not-a-uuid',
    });

    expect(result).toEqual({ error: 'Élément introuvable. Rechargez la page et réessayez.' });
    expect(mockReceiveStock).not.toHaveBeenCalled();
  });

  it('rejects a note over the 500-char cap', async () => {
    const { actionReceiveStock } = await import('@/app/actions/inventory');
    const result = await actionReceiveStock(TENANT_ID, {
      ...validReceive,
      notes: 'x'.repeat(501),
    });

    expect(result).toEqual({ error: 'La note est trop longue (500 caractères au maximum).' });
    expect(mockReceiveStock).not.toHaveBeenCalled();
  });

  it('returns a permission error when the caller lacks inventory access', async () => {
    mockGetAuthUserForTenant.mockRejectedValue(new MockAuthError(403));

    const { actionReceiveStock } = await import('@/app/actions/inventory');
    const result = await actionReceiveStock(TENANT_ID, validReceive);

    expect(result).toEqual({ error: 'Permissions insuffisantes' });
    expect(mockReceiveStock).not.toHaveBeenCalled();
  });
});

describe("prix d'achat a la reception (cout moyen pondere)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUserForTenant.mockResolvedValue({
      supabase: supabaseOnPlan('pro'),
      user: { id: 'user-9' },
    });
    mockReceiveStock.mockResolvedValue(undefined);
    mockAdjustStock.mockResolvedValue(undefined);
  });

  it('actionReceiveStock transmet le prix valide au service', async () => {
    const { actionReceiveStock } = await import('@/app/actions/inventory');
    const result = await actionReceiveStock(TENANT_ID, {
      ingredient_id: INGREDIENT_ID,
      quantity: 2,
      inPurchaseUnit: true,
      unit_cost: 12000,
    });

    expect(result).toEqual({ success: true });
    expect(mockReceiveStock).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ quantity: 2, inPurchaseUnit: true, unit_cost: 12000 }),
    );
  });

  it.each([
    [0, "Le prix d'achat doit être supérieur à 0."],
    [-5, "Le prix d'achat doit être supérieur à 0."],
    [100_000_000, "Le prix d'achat est trop grand (99 999 999 au maximum)."],
    [Number.NaN, "Saisissez un prix d'achat valide."],
  ])('actionReceiveStock refuse le prix %s avec un message en francais', async (cost, message) => {
    const { actionReceiveStock } = await import('@/app/actions/inventory');
    const result = await actionReceiveStock(TENANT_ID, {
      ingredient_id: INGREDIENT_ID,
      quantity: 2,
      inPurchaseUnit: false,
      unit_cost: cost,
    });

    expect(result).toEqual({ error: message });
    expect(mockReceiveStock).not.toHaveBeenCalled();
  });

  it('actionAdjustStock transmet le prix pour une reception', async () => {
    const { actionAdjustStock } = await import('@/app/actions/inventory');
    const result = await actionAdjustStock(TENANT_ID, {
      ingredient_id: INGREDIENT_ID,
      quantity: 5,
      movement_type: 'manual_add',
      unit_cost: 1600,
    });

    expect(result).toEqual({ success: true });
    expect(mockAdjustStock).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ quantity: 5, movement_type: 'manual_add', unit_cost: 1600 }),
    );
  });

  it('actionAdjustStock refuse un prix sur un retrait ou un stock d ouverture', async () => {
    const { actionAdjustStock } = await import('@/app/actions/inventory');
    for (const movement_type of ['manual_remove', 'opening'] as const) {
      const result = await actionAdjustStock(TENANT_ID, {
        ingredient_id: INGREDIENT_ID,
        quantity: 5,
        movement_type,
        unit_cost: 1600,
      });
      expect(result).toEqual({ error: "Un prix d'achat se saisit seulement pour une réception." });
    }
    expect(mockAdjustStock).not.toHaveBeenCalled();
    expect(mockSetOpeningStock).not.toHaveBeenCalled();
  });

  it('actionAdjustStock sans prix: unit_cost absent (le cout ne change pas)', async () => {
    const { actionAdjustStock } = await import('@/app/actions/inventory');
    await actionAdjustStock(TENANT_ID, {
      ingredient_id: INGREDIENT_ID,
      quantity: 5,
      movement_type: 'manual_add',
    });

    const [, input] = mockAdjustStock.mock.calls[0] as unknown as [string, { unit_cost?: number }];
    expect(input.unit_cost).toBeUndefined();
  });
});

describe('actionCreateIngredient / actionUpdateIngredient purchase-unit schema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUserForTenant.mockResolvedValue({
      supabase: supabaseOnPlan('pro'),
      user: { id: 'user-9' },
    });
  });

  it('rejects units_per_purchase <= 0 on create', async () => {
    const { actionCreateIngredient } = await import('@/app/actions/inventory');
    const result = await actionCreateIngredient(TENANT_ID, {
      name: 'Coca',
      unit: 'bouteille',
      purchase_unit: 'casier',
      units_per_purchase: 0,
    });

    expect(result).toEqual({ error: "Le nombre d'unités par achat doit être supérieur à 0." });
  });

  it('rejects units_per_purchase <= 0 on update', async () => {
    const { actionUpdateIngredient } = await import('@/app/actions/inventory');
    const result = await actionUpdateIngredient(TENANT_ID, INGREDIENT_ID, {
      units_per_purchase: -5,
    });

    expect(result).toEqual({ error: "Le nombre d'unités par achat doit être supérieur à 0." });
  });
});

describe('actionGetLossesByReason (READ gated at inventory.view)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUserForTenant.mockResolvedValue({
      supabase: supabaseOnPlan('pro'),
      user: { id: 'user-9' },
    });
    mockGetLossesByReason.mockResolvedValue([]);
  });

  it('gates on inventory.view with a view-inclusive role list (chef can read)', async () => {
    const { actionGetLossesByReason } = await import('@/app/actions/inventory');
    const result = await actionGetLossesByReason(TENANT_ID);

    expect(result).toEqual({ success: true, data: [] });
    // The coarse role list must include view-only roles (chef, cashier, waiter)
    // and the fine permission must be the READ code, mirroring the page.
    expect(mockGetAuthUserForTenant).toHaveBeenCalledWith(
      TENANT_ID,
      ['owner', 'admin', 'manager', 'cashier', 'chef', 'waiter'],
      'inventory.view',
    );
  });

  it('returns the report rows on success', async () => {
    const rows = [{ reason_code: 'breakage', nb_movements: 1, total_qty: 2, total_cost_value: 50 }];
    mockGetLossesByReason.mockResolvedValue(rows);

    const { actionGetLossesByReason } = await import('@/app/actions/inventory');
    const result = await actionGetLossesByReason(TENANT_ID, {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });

    expect(result).toEqual({ success: true, data: rows });
    expect(mockGetLossesByReason).toHaveBeenCalledWith(TENANT_ID, {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
  });

  it('returns a permission error when the caller lacks inventory.view', async () => {
    mockGetAuthUserForTenant.mockRejectedValue(new MockAuthError(403));

    const { actionGetLossesByReason } = await import('@/app/actions/inventory');
    const result = await actionGetLossesByReason(TENANT_ID);

    expect(result).toEqual({ error: 'Permissions insuffisantes' });
    expect(mockGetLossesByReason).not.toHaveBeenCalled();
  });
});

/**
 * F4: une Server Action est un endpoint POST adressable par son Action ID. Gater
 * la PAGE sur canAccessInventory ne gate pas la MUTATION: un tenant Starter
 * (39 000 XAF) pouvait piloter le module Inventaire, vendu avec le plan Pro
 * (79 000 XAF), sans jamais ouvrir l'ecran. Ces tests verrouillent le refus cote
 * serveur - role et permission valides, plan insuffisant.
 */
describe('garde de plan (F4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUserForTenant.mockResolvedValue({
      supabase: supabaseOnPlan('starter'),
      user: { id: 'user-9' },
    });
  });

  it('refuse une ECRITURE a un tenant starter et n_ecrit rien', async () => {
    const { actionRecordLoss } = await import('@/app/actions/inventory');
    const result = await actionRecordLoss(TENANT_ID, validInput);

    expect(result).toEqual({ error: 'Le module Inventaire est reserve au plan Pro.' });
    expect(mockRecordLoss).not.toHaveBeenCalled();
  });

  it('refuse une LECTURE de rapport a un tenant starter', async () => {
    const { actionGetLossesByReason } = await import('@/app/actions/inventory');
    const result = await actionGetLossesByReason(TENANT_ID);

    expect(result).toEqual({ error: 'Le module Inventaire est reserve au plan Pro.' });
    expect(mockGetLossesByReason).not.toHaveBeenCalled();
  });

  it('laisse passer un tenant pro', async () => {
    mockGetAuthUserForTenant.mockResolvedValue({
      supabase: supabaseOnPlan('pro'),
      user: { id: 'user-9' },
    });
    mockRecordLoss.mockResolvedValue(undefined);

    const { actionRecordLoss } = await import('@/app/actions/inventory');
    const result = await actionRecordLoss(TENANT_ID, validInput);

    expect(result).toEqual({ success: true });
    expect(mockRecordLoss).toHaveBeenCalled();
  });
});

describe("actionAdjustStock / actionSetOpeningStock: stock d'ouverture et messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUserForTenant.mockResolvedValue({
      supabase: supabaseOnPlan('pro'),
      user: { id: 'user-9' },
    });
    mockAdjustStock.mockResolvedValue(undefined);
    mockSetOpeningStock.mockResolvedValue(undefined);
  });

  it('le type "opening" REMPLACE le stock: il passe par setOpeningStock, jamais par adjustStock', async () => {
    const { actionAdjustStock } = await import('@/app/actions/inventory');
    const result = await actionAdjustStock(TENANT_ID, {
      ingredient_id: INGREDIENT_ID,
      quantity: 5,
      movement_type: 'opening',
    });

    expect(result).toEqual({ success: true });
    expect(mockSetOpeningStock).toHaveBeenCalledWith(TENANT_ID, INGREDIENT_ID, 5);
    expect(mockAdjustStock).not.toHaveBeenCalled();
  });

  it('un ajout manuel continue de passer par adjustStock (temoin: la mesure reagit)', async () => {
    const { actionAdjustStock } = await import('@/app/actions/inventory');
    await actionAdjustStock(TENANT_ID, {
      ingredient_id: INGREDIENT_ID,
      quantity: 5,
      movement_type: 'manual_add',
    });

    expect(mockAdjustStock).toHaveBeenCalledTimes(1);
    expect(mockSetOpeningStock).not.toHaveBeenCalled();
  });

  it('actionSetOpeningStock accepte 0 (remise a zero) et refuse un negatif en francais', async () => {
    const { actionSetOpeningStock } = await import('@/app/actions/inventory');

    expect(await actionSetOpeningStock(TENANT_ID, INGREDIENT_ID, 0)).toEqual({ success: true });
    expect(mockSetOpeningStock).toHaveBeenCalledWith(TENANT_ID, INGREDIENT_ID, 0);

    expect(await actionSetOpeningStock(TENANT_ID, INGREDIENT_ID, -1)).toEqual({
      error: 'Le stock ne peut pas être négatif.',
    });
  });

  it('une quantite trop grande donne un message qui dit la limite', async () => {
    const { actionAdjustStock } = await import('@/app/actions/inventory');
    const result = await actionAdjustStock(TENANT_ID, {
      ingredient_id: INGREDIENT_ID,
      quantity: 99999999999,
      movement_type: 'manual_add',
    });

    expect(result).toEqual({ error: 'La quantité est trop grande (9 999 999 au maximum).' });
    expect(mockAdjustStock).not.toHaveBeenCalled();
  });

  it('un nom de produit de 101 caracteres dit quoi corriger, en francais', async () => {
    const { actionCreateIngredient } = await import('@/app/actions/inventory');
    const result = await actionCreateIngredient(TENANT_ID, {
      name: 'x'.repeat(101),
      unit: 'kg',
    });

    expect(result).toEqual({ error: 'Le nom est trop long (100 caractères au maximum).' });
  });

  it('un stock initial negatif dit que le stock ne peut pas etre negatif', async () => {
    const { actionCreateIngredient } = await import('@/app/actions/inventory');
    const result = await actionCreateIngredient(TENANT_ID, {
      name: 'Riz',
      unit: 'kg',
      current_stock: -3,
    });

    expect(result).toEqual({ error: 'Le stock ne peut pas être négatif.' });
  });
});
