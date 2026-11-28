import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceError } from '@/services/errors';

/**
 * Decision du proprietaire (2026-11-09):
 *   - le serveur prend les commandes et les fait avancer, sans toucher a l'argent;
 *   - le chef garde la cuisine, sans toucher a l'argent;
 *   - le caissier encaisse.
 *
 * Mesure avant correction: un chef avait enregistre un paiement par
 * `/api/orders/mutations` type 'pay' (actionMarkOrderPaid ne demandait qu'un
 * droit de service, que le chef detient), et pouvait mettre une note sur une
 * ardoise ou annuler une commande impayee.
 *
 * Ces tests passent par la VRAIE resolution de permissions
 * (getAuthenticatedUserForTenant -> resolveMemberLevels -> POSTE_MATRIX):
 * seul le client Supabase est simule. Un test qui simulerait la garde elle-meme
 * ne pourrait que confirmer ce qu'on lui dit.
 */

// actions/orders.ts reaches push.service (server-only) via order-ready.service.
vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importActual) => ({
  ...(await importActual<typeof import('next/server')>()),
  after: () => {},
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => `traduit:${key}`,
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const TENANT_ID = '22222222-2222-4222-a222-222222222222';
const ORDER_ID = '33333333-3333-4333-a333-333333333333';
const ACCOUNT_ID = '44444444-4444-4444-a444-444444444444';

// Membre courant: poste et reglage par personne, modifiables par test.
const member: { poste: string; custom: Record<string, boolean> | null } = {
  poste: 'chef',
  custom: null,
};

// Plan du restaurant, modifiable par test (garde des pourboires).
const tenantPlan = { value: 'business' };

function chain(table: string) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'neq', 'order', 'limit']) c[m] = vi.fn(() => c);
  const row =
    table === 'admin_users'
      ? {
          id: 'admin-1',
          tenant_id: TENANT_ID,
          postes: [member.poste],
          permission_overrides: member.custom,
        }
      : table === 'tenants'
        ? {
            subscription_plan: tenantPlan.value,
            subscription_status: 'active',
            trial_ends_at: null,
            is_active: true,
            suspended_at: null,
          }
        : null;
  // Reglages du restaurant par poste (poste_permissions): aucun, la matrice decide.
  if (table === 'poste_permissions') {
    c.then = (ok: (v: { data: never[]; error: null }) => unknown) => ok({ data: [], error: null });
  }
  c.single = vi.fn(async () => ({ data: row, error: row ? null : { message: 'none' } }));
  c.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  return c;
}

const fakeSupabase = {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u-1', email: 'x@y.z' } } })) },
  from: vi.fn((table: string) => chain(table)),
};
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fakeSupabase) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fakeSupabase) }));

const mockMarkPaid = vi.fn();
const mockCancelOrder = vi.fn();
const mockUpdateStatus = vi.fn();
vi.mock('@/services/order.service', () => ({
  createOrderService: vi.fn(() => ({
    markPaid: mockMarkPaid,
    cancelOrder: mockCancelOrder,
    updateStatus: mockUpdateStatus,
  })),
}));

vi.mock('@/services/coupon.service', () => ({
  createCouponService: vi.fn(() => ({
    releaseForCancelledOrder: vi.fn().mockResolvedValue(false),
  })),
}));

const mockRecordTender = vi.fn();
const mockGetSummary = vi.fn();
const mockRefund = vi.fn();
const mockComp = vi.fn();
vi.mock('@/services/payment.service', () => ({
  createPaymentService: vi.fn(() => ({
    recordTender: mockRecordTender,
    getSummary: mockGetSummary,
    refund: mockRefund,
    compOrder: mockComp,
  })),
}));

const mockAttach = vi.fn();
const mockCreateAccount = vi.fn();
vi.mock('@/services/order-annotation.service', () => ({
  createOrderAnnotationService: vi.fn(() => ({
    attachOrderToHouseAccount: mockAttach,
    createHouseAccount: mockCreateAccount,
  })),
}));

const mockSettle = vi.fn();
vi.mock('@/services/house-account-settlement.service', () => ({
  createHouseAccountSettlementService: vi.fn(() => ({ settle: mockSettle })),
}));
vi.mock('@/services/audit.service', () => ({ createAuditService: () => ({ log: vi.fn() }) }));

beforeEach(() => {
  vi.clearAllMocks();
  member.poste = 'chef';
  member.custom = null;
  tenantPlan.value = 'business';
  mockMarkPaid.mockResolvedValue({ paid: true });
  mockRecordTender.mockResolvedValue({ paymentStatus: 'paid', net: 100, due: 0 });
  mockGetSummary.mockResolvedValue({ paymentStatus: 'pending', due: 100, net: 0 });
  mockRefund.mockResolvedValue({ paymentStatus: 'refunded' });
  mockComp.mockResolvedValue({ comped: false, summary: { paymentStatus: 'comp' } });
  mockCreateAccount.mockResolvedValue({ id: ACCOUNT_ID });
  mockSettle.mockResolvedValue(undefined);
});

describe('argent: chef et serveur refuses, caissier accepte', () => {
  it.each(['chef', 'waiter'])('%s ne marque PAS une commande payee', async (poste) => {
    member.poste = poste;
    const { actionMarkOrderPaid } = await import('@/app/actions/orders');
    const res = await actionMarkOrderPaid(TENANT_ID, ORDER_ID, 'cash');
    expect(res.error).toBe('Permissions insuffisantes');
    expect(mockMarkPaid).not.toHaveBeenCalled();
  });

  it('le caissier marque une commande payee', async () => {
    member.poste = 'cashier';
    const { actionMarkOrderPaid } = await import('@/app/actions/orders');
    const res = await actionMarkOrderPaid(TENANT_ID, ORDER_ID, 'cash');
    expect(res.success).toBe(true);
    expect(mockMarkPaid).toHaveBeenCalled();
  });

  it.each(['chef', 'waiter'])('%s n inscrit PAS de tender', async (poste) => {
    member.poste = poste;
    const { actionRecordTender } = await import('@/app/actions/orders');
    const res = await actionRecordTender(TENANT_ID, ORDER_ID, 100, 'cash');
    expect(res.error).toBe('Permissions insuffisantes');
    expect(mockRecordTender).not.toHaveBeenCalled();
  });

  it('le caissier inscrit un tender', async () => {
    member.poste = 'cashier';
    const { actionRecordTender } = await import('@/app/actions/orders');
    const res = await actionRecordTender(TENANT_ID, ORDER_ID, 100, 'cash');
    expect(res.success).toBe(true);
  });

  it.each(['chef', 'waiter'])('%s ne met PAS une note sur une ardoise', async (poste) => {
    member.poste = poste;
    const { actionAttachOrderToHouseAccount } = await import('@/app/actions/house-accounts');
    const res = await actionAttachOrderToHouseAccount(TENANT_ID, ORDER_ID, ACCOUNT_ID);
    expect(res.error).toBe('Permissions insuffisantes');
    expect(mockAttach).not.toHaveBeenCalled();
  });

  it('le proprietaire peut retirer orders.pay a un caissier, et la garde le suit', async () => {
    member.poste = 'cashier';
    member.custom = { 'orders.pay': false };
    const { actionMarkOrderPaid } = await import('@/app/actions/orders');
    const res = await actionMarkOrderPaid(TENANT_ID, ORDER_ID, 'cash');
    expect(res.error).toBe('Permissions insuffisantes');
  });
});

describe('statut: avancer oui, annuler non, pour le serveur et le chef', () => {
  it.each(['waiter', 'chef'])('%s fait avancer une commande (servie)', async (poste) => {
    member.poste = poste;
    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const res = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'delivered');
    expect(res.success).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalledWith(ORDER_ID, TENANT_ID, 'delivered');
  });

  it.each(['waiter', 'chef'])('%s n annule PAS une commande (note impayee)', async (poste) => {
    member.poste = poste;
    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const res = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'cancelled');
    expect(res.error).toBe('Permissions insuffisantes');
    expect(mockCancelOrder).not.toHaveBeenCalled();
  });

  it('le caissier annule une commande', async () => {
    member.poste = 'cashier';
    mockCancelOrder.mockResolvedValue(true);
    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const res = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'cancelled');
    expect(res.success).toBe(true);
    expect(mockCancelOrder).toHaveBeenCalled();
  });

  it('un acompte au registre refuse au caissier: message traduit, pas le texte brut', async () => {
    member.poste = 'cashier';
    mockCancelOrder.mockRejectedValueOnce(
      new ServiceError('texte brut', 'CONFLICT', { reason: 'cancel_needs_money_authority' }),
    );
    const { actionUpdateOrderStatus } = await import('@/app/actions/orders');
    const res = await actionUpdateOrderStatus(TENANT_ID, ORDER_ID, 'cancelled');
    expect(res.error).toBe('traduit:cancelNeedsMoneyAuthority');
  });
});

describe('lecture du reglement: voir les commandes suffit (ORDERS_VIEW)', () => {
  it('un cuisinier (kitchen.track, sans orders.take) lit le detail de paiement', async () => {
    member.poste = 'cook';
    const { actionGetPaymentSummary } = await import('@/app/actions/orders');
    const res = await actionGetPaymentSummary(TENANT_ID, ORDER_ID);
    expect(res.error).toBeUndefined();
    expect(res.summary).toBeDefined();
  });

  it('temoin: un serveur a qui l on retire orders.take ne lit plus rien', async () => {
    member.poste = 'waiter';
    member.custom = { 'orders.take': false };
    const { actionGetPaymentSummary } = await import('@/app/actions/orders');
    const res = await actionGetPaymentSummary(TENANT_ID, ORDER_ID);
    expect(res.error).toBe('Permissions insuffisantes');
    expect(res.summary).toBeUndefined();
  });
});

/**
 * Autorite d'argent (MONEY_PERMISSIONS): rembourser, offrir, creer et solder
 * une ardoise exigent les QUATRE droits orders.pay, refund, cancel, discount
 * ensemble, comme la garde de la base. Meme requete, plusieurs membres, des
 * resultats differents: si la garde etait retiree (ou reduite a un seul droit),
 * le caissier et le caissier a un droit passeraient et ces tests echoueraient.
 */
describe('autorite d argent: les quatre droits ensemble', () => {
  type Appel = () => Promise<{ error?: string; success?: boolean }>;
  const actions: Array<[string, Appel, () => unknown]> = [
    [
      'rembourser',
      async () =>
        (await import('@/app/actions/orders')).actionRefundOrder(TENANT_ID, ORDER_ID, 100, 'cash'),
      () => mockRefund,
    ],
    [
      'offrir',
      async () =>
        (await import('@/app/actions/orders')).actionCompOrder(
          TENANT_ID,
          ORDER_ID,
          'cadeau maison',
        ),
      () => mockComp,
    ],
    [
      'creer une ardoise',
      async () =>
        (await import('@/app/actions/house-accounts')).actionCreateHouseAccount(
          TENANT_ID,
          'Client',
        ),
      () => mockCreateAccount,
    ],
    [
      'solder une ardoise',
      async () =>
        (await import('@/app/actions/house-accounts')).actionSettleHouseAccount(
          TENANT_ID,
          ACCOUNT_ID,
        ),
      () => mockSettle,
    ],
  ];

  describe.each(actions)('%s', (_nom, appel, service) => {
    it('gerant: accepte, le service est atteint', async () => {
      member.poste = 'manager';
      const res = await appel();
      expect(res.success).toBe(true);
      expect(service()).toHaveBeenCalledTimes(1);
    });

    it('caissier: refuse, le service n est jamais atteint', async () => {
      member.poste = 'cashier';
      const res = await appel();
      expect(res.error).toBe('Permissions insuffisantes');
      expect(service()).not.toHaveBeenCalled();
    });

    it.each(['orders.refund', 'orders.cancel', 'orders.discount'])(
      'caissier avec %s seul en plus: refuse',
      async (code) => {
        member.poste = 'cashier';
        member.custom = { [code]: true };
        const res = await appel();
        expect(res.error).toBe('Permissions insuffisantes');
        expect(service()).not.toHaveBeenCalled();
      },
    );

    it('caissier avec les quatre droits: accepte', async () => {
      member.poste = 'cashier';
      member.custom = {
        'orders.pay': true,
        'orders.refund': true,
        'orders.cancel': true,
        'orders.discount': true,
      };
      const res = await appel();
      expect(res.success).toBe(true);
      expect(service()).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * Constat E (audit pourboires 2026-11-20): aucun test ne verifiait, au niveau
 * de l'action, le refus du pourboire selon le plan. Les pourboires sont Pro et
 * plus (canAccessTips). Le temoin positif (Pro accepte) prouve que le refus
 * vient bien du plan, pas d'une autre garde.
 */
describe('pourboire a l encaissement: refuse au plan Starter', () => {
  it('Starter: un pourboire est refuse et rien n est encaisse', async () => {
    member.poste = 'cashier';
    tenantPlan.value = 'starter';
    const { actionMarkOrderPaid } = await import('@/app/actions/orders');
    const res = await actionMarkOrderPaid(TENANT_ID, ORDER_ID, 'cash', 500);
    expect(res.error).toBe('Les pourboires ne sont pas inclus dans votre plan.');
    expect(mockMarkPaid).not.toHaveBeenCalled();
  });

  it('Starter: sans pourboire, l encaissement passe', async () => {
    member.poste = 'cashier';
    tenantPlan.value = 'starter';
    const { actionMarkOrderPaid } = await import('@/app/actions/orders');
    const res = await actionMarkOrderPaid(TENANT_ID, ORDER_ID, 'cash');
    expect(res.success).toBe(true);
  });

  it('Pro: le meme pourboire est accepte', async () => {
    member.poste = 'cashier';
    tenantPlan.value = 'pro';
    const { actionMarkOrderPaid } = await import('@/app/actions/orders');
    const res = await actionMarkOrderPaid(TENANT_ID, ORDER_ID, 'cash', 500);
    expect(res.success).toBe(true);
    expect(mockMarkPaid).toHaveBeenCalledWith(ORDER_ID, TENANT_ID, {
      method: 'cash',
      tipAmount: 500,
    });
  });

  // Constat F, premiere barriere: un pourboire non entier ou demesure est
  // refuse avant tout acces a la base (le plafond exact est dans markPaid).
  // Contre-verification du 2026-11-21: le moyen etait un texte libre, refuse
  // seulement par la base (23514). Meme liste que la contrainte maintenant.
  it('refuse un moyen de paiement inconnu avant tout acces a la base', async () => {
    member.poste = 'cashier';
    const { actionMarkOrderPaid } = await import('@/app/actions/orders');
    const res = await actionMarkOrderPaid(TENANT_ID, ORDER_ID, 'bitcoin');
    expect(res.error).toBe('Donnees invalides');
    expect(mockMarkPaid).not.toHaveBeenCalled();
  });

  it.each([12.5, 100_000_001])('refuse un pourboire invalide (%s)', async (tip) => {
    member.poste = 'cashier';
    tenantPlan.value = 'pro';
    const { actionMarkOrderPaid } = await import('@/app/actions/orders');
    const res = await actionMarkOrderPaid(TENANT_ID, ORDER_ID, 'cash', tip);
    expect(res.error).toBe('Donnees invalides');
    expect(mockMarkPaid).not.toHaveBeenCalled();
  });
});
