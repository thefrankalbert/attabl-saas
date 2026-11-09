import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { orderMutationSchema } from '@/lib/validations/order-mutation.schema';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockRateLimitCheck = vi.fn<() => Promise<{ success: boolean }>>();
const mockSettlementLimitCheck = vi.fn<() => Promise<{ success: boolean }>>();
vi.mock('@/lib/rate-limit', () => ({
  assignmentLimiter: { check: () => mockRateLimitCheck() },
  orderSettlementLimiter: { check: () => mockSettlementLimitCheck() },
  // Gestes article de la cuisine: meme budget que les assignations dans ce test.
  kitchenItemLimiter: { check: () => mockRateLimitCheck() },
  getClientIp: () => '127.0.0.1',
}));

vi.mock('@/lib/csrf', () => ({ verifyOrigin: () => null }));

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Map([['x-tenant-slug', 'demo']])),
}));

const mockActionStatus = vi.fn();
const mockActionAssign = vi.fn();
const mockActionRelease = vi.fn();
const mockActionMarkPaid = vi.fn();
const mockActionItemStatus = vi.fn();
const mockActionCourseHeld = vi.fn();
vi.mock('@/app/actions/orders', () => ({
  actionUpdateOrderStatus: (...a: unknown[]) => mockActionStatus(...a),
  actionMarkOrderPaid: (...a: unknown[]) => mockActionMarkPaid(...a),
  actionUpdateItemStatus: (...a: unknown[]) => mockActionItemStatus(...a),
  actionSetCourseHeld: (...a: unknown[]) => mockActionCourseHeld(...a),
}));
vi.mock('@/app/actions/assignments', () => ({
  actionAssignServer: (...a: unknown[]) => mockActionAssign(...a),
  actionReleaseAssignment: (...a: unknown[]) => mockActionRelease(...a),
}));

// Configurable idempotency outcomes for each test.
let insertResult: { error: { code: string } | null } = { error: null };
// processed_at of the existing claim row returned on a 23505 duplicate.
let existingProcessedAt: string | null = null;
// Ligne rendue par la tentative de reprise d'une reservation abandonnee.
// null = la reservation est encore fraiche, donc une autre tentative est en vol.
let staleTakeoverRow: { client_request_id: string } | null = null;
const mockInsert = vi.fn(() => Promise.resolve(insertResult));
const mockDeleteEq = vi.fn(() => Promise.resolve({ error: null }));
const mockTakeover = vi.fn(() => Promise.resolve({ data: staleTakeoverRow }));
// `update().eq()` sert DEUX chemins: marquer processed_at (on attend la promesse)
// et reprendre une reservation abandonnee (on enchaine .is().lt().select()).
// Le mock doit donc etre a la fois attendable et chainable.
const mockUpdateEq = vi.fn(() => {
  const promise = Promise.resolve({ error: null });
  return Object.assign(promise, {
    is: () => ({
      lt: () => ({
        select: () => ({ maybeSingle: mockTakeover }),
      }),
    }),
  });
});

/**
 * La ligne `tenants` servie aux DEUX lectures de ce chemin. Mutable: les tests
 * de coupure la remplacent par un restaurant gele, suspendu ou desactive.
 */
const LIGNE_SERVANTE = {
  id: 't1',
  is_active: true,
  suspended_at: null,
  subscription_status: 'active' as string | null,
};
let tenantRow: Record<string, unknown> | null = { ...LIGNE_SERVANTE };

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
      from: (table: string) => {
        if (table === 'tenants') {
          // Deux lectures distinctes de `tenants` sur ce chemin: la resolution
          // par slug (qui ne veut que l'id) et la COUPURE du restaurant, posee
          // avant la reservation d'idempotence. Une ligne qui omet les verrous
          // decrit un restaurant coupe: toute la suite repondrait 403.
          //
          // Droits par colonne (PR #362): `authenticated` ne lit pas
          // `stripe_subscription_id`. Le demander ici rend 42501, comme en base.
          return {
            select: (colonnes: string) => ({
              eq: () => ({
                is: () => ({
                  single: () =>
                    Promise.resolve(
                      colonnes.includes('stripe_subscription_id')
                        ? { data: null, error: { code: '42501' } }
                        : { data: tenantRow, error: null },
                    ),
                }),
              }),
            }),
          };
        }
        if (table === 'admin_users') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'a1' } }) }),
                }),
              }),
            }),
          };
        }
        // order_mutation_requests
        return {
          insert: mockInsert,
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { processed_at: existingProcessedAt } }),
            }),
          }),
          delete: () => ({ eq: mockDeleteEq }),
          update: () => ({ eq: mockUpdateEq }),
        };
      },
    }),
}));

/** Client service_role: la COUPURE du restaurant y lit ses colonnes de verrou. */
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            single: () => Promise.resolve({ data: tenantRow, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

function post(body: unknown): Request {
  return new Request('https://demo.attabl.com/api/orders/mutations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('orderMutationSchema', () => {
  const rid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const oid = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';

  it('accepts a valid status mutation', () => {
    expect(
      orderMutationSchema.safeParse({
        type: 'status',
        client_request_id: rid,
        orderId: oid,
        status: 'delivered',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(orderMutationSchema.safeParse({ type: 'nope', client_request_id: rid }).success).toBe(
      false,
    );
  });

  it('rejects a non-uuid client_request_id', () => {
    expect(
      orderMutationSchema.safeParse({
        type: 'release',
        client_request_id: 'not-a-uuid',
        assignmentId: oid,
      }).success,
    ).toBe(false);
  });
});

describe('POST /api/orders/mutations (idempotency)', () => {
  const rid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const oid = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitCheck.mockResolvedValue({ success: true });
    mockSettlementLimitCheck.mockResolvedValue({ success: true });
    insertResult = { error: null };
    existingProcessedAt = null;
    staleTakeoverRow = null;
    tenantRow = { ...LIGNE_SERVANTE };
  });

  it('runs the action once on a fresh request', async () => {
    mockActionStatus.mockResolvedValue({ success: true });
    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'status', client_request_id: rid, orderId: oid, status: 'delivered' }),
    );
    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockActionStatus).toHaveBeenCalledWith('t1', oid, 'delivered');
  });

  it('dedupes a replayed request as success only when the first attempt COMPLETED', async () => {
    insertResult = { error: { code: '23505' } }; // unique_violation
    existingProcessedAt = '2026-07-18T10:00:00Z'; // first attempt finished
    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'status', client_request_id: rid, orderId: oid, status: 'delivered' }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.deduped).toBe(true);
    expect(mockActionStatus).not.toHaveBeenCalled();
  });

  it('answers 409 (retryable) while a concurrent claim is still in flight', async () => {
    insertResult = { error: { code: '23505' } };
    existingProcessedAt = null; // first attempt still running
    staleTakeoverRow = null; // claim encore fraiche: pas de reprise
    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'status', client_request_id: rid, orderId: oid, status: 'delivered' }),
    );
    expect(res.status).toBe(409);
    expect(mockActionStatus).not.toHaveBeenCalled();
  });

  it('reprend une reservation abandonnee et rejoue la mutation', async () => {
    // Un appelant mort entre la pose de la cle et la fin de la mutation laissait
    // une ligne processed_at NULL pour toujours: chaque rejeu recevait 409
    // jusqu'a epuisement du budget, et un encaissement REEL etait signale au
    // caissier comme non synchronise alors qu'il n'avait jamais ete applique.
    insertResult = { error: { code: '23505' } };
    existingProcessedAt = null;
    staleTakeoverRow = { client_request_id: rid }; // reservation trop vieille
    mockActionStatus.mockResolvedValue({ success: true });

    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'status', client_request_id: rid, orderId: oid, status: 'delivered' }),
    );

    expect(res.status).toBe(200);
    expect(mockActionStatus).toHaveBeenCalledWith('t1', oid, 'delivered');
  });

  it('marks the claim processed on success', async () => {
    mockActionStatus.mockResolvedValue({ success: true });
    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'status', client_request_id: rid, orderId: oid, status: 'delivered' }),
    );
    expect(res.status).toBe(200);
    expect(mockUpdateEq).toHaveBeenCalled();
  });

  it('releases the idempotency key when the action is rejected (422 business)', async () => {
    mockActionStatus.mockResolvedValue({ error: 'Statut invalide' });
    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'status', client_request_id: rid, orderId: oid, status: 'bogus' }),
    );
    expect(res.status).toBe(422);
    expect(mockDeleteEq).toHaveBeenCalled();
  });

  it('maps the internal-error sentinel to 500 so the outbox retries it', async () => {
    mockActionStatus.mockResolvedValue({ error: 'Erreur interne' });
    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'status', client_request_id: rid, orderId: oid, status: 'delivered' }),
    );
    expect(res.status).toBe(500);
    expect(mockDeleteEq).toHaveBeenCalled();
  });

  // OFF-05. L'encaissement est le seul type qui ecrive dans le grand livre
  // payments: un rejeu non deduplique y creerait une deuxieme ligne, donc un
  // ecart de caisse. Ces trois tests couvrent le chemin de l'argent.
  it('pay: encaisse une commande ouverte et derive le tenant cote serveur', async () => {
    mockActionMarkPaid.mockResolvedValue({ success: true, paid: true });
    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'pay', client_request_id: rid, orderId: oid, method: 'cash', tipMinor: 500 }),
    );
    expect(res.status).toBe(200);
    // 't1' vient du lookup tenant serveur, JAMAIS du corps de la requete.
    expect(mockActionMarkPaid).toHaveBeenCalledWith('t1', oid, 'cash', 500);
  });

  it('pay: un rejeu de la meme cle ne cree PAS une deuxieme ligne de paiement', async () => {
    insertResult = { error: { code: '23505' } };
    existingProcessedAt = '2026-08-05T10:00:00Z'; // premier encaissement abouti
    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'pay', client_request_id: rid, orderId: oid, method: 'cash' }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.deduped).toBe(true);
    expect(mockActionMarkPaid).not.toHaveBeenCalled();
  });

  it('pay: utilise le compartiment de limitation des encaissements, pas celui des assignations', async () => {
    // Partager le compartiment des assignations faisait tomber les encaissements
    // en 429 en plein coup de feu; un 429 etant classe transitoire, le paiement
    // partait en file en affichant "en attente de reseau" - un mensonge.
    mockActionMarkPaid.mockResolvedValue({ success: true, paid: true });
    const { POST } = await import('@/app/api/orders/mutations/route');
    await POST(post({ type: 'pay', client_request_id: rid, orderId: oid, method: 'cash' }));

    expect(mockSettlementLimitCheck).toHaveBeenCalled();
    expect(mockRateLimitCheck).not.toHaveBeenCalled();
  });
});

// --- Coupure du restaurant ------------------------------------
/**
 * Cette route delegue a `actionMarkOrderPaid`, `actionRefundOrder`,
 * `actionCompOrder`, `actionUpdateOrderStatus`: aucun de ces chemins ne
 * consultait l'etat de l'abonnement. Un restaurant gele encaissait,
 * remboursait et soldait ses tables. Meme cause que sur `/api/orders/pos`: le
 * verrou du middleware ne garde que les PAGES, jamais `/api/*`.
 */
describe('POST /api/orders/mutations - coupure du restaurant', () => {
  const rid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const oid = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitCheck.mockResolvedValue({ success: true });
    mockSettlementLimitCheck.mockResolvedValue({ success: true });
    insertResult = { error: null };
    existingProcessedAt = null;
    staleTakeoverRow = null;
    tenantRow = { ...LIGNE_SERVANTE };
  });

  afterEach(() => {
    tenantRow = { ...LIGNE_SERVANTE };
  });

  it.each([
    ['gele', { subscription_status: 'frozen' }],
    ['resilie', { subscription_status: 'cancelled' }],
    ['suspendu par le super-admin', { suspended_at: '2026-11-01T00:00:00Z' }],
    ['desactive', { is_active: false }],
    // Le cron ne gele qu'a 02:00: sans ce verrou, jusqu'a 24 h d'encaissement.
    [
      'en essai expire, pas encore gele',
      {
        subscription_status: 'trial',
        trial_ends_at: '2020-01-01T00:00:00Z',
        stripe_subscription_id: null,
      },
    ],
  ])('pay: refuse en 403 quand le restaurant est %s', async (_cas, etat) => {
    tenantRow = { ...LIGNE_SERVANTE, ...etat };
    mockActionMarkPaid.mockResolvedValue({ success: true, paid: true });

    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'pay', client_request_id: rid, orderId: oid, method: 'cash' }),
    );

    expect(res.status).toBe(403);
    expect(mockActionMarkPaid).not.toHaveBeenCalled();
    // La cle d'idempotence ne doit PAS etre consommee: sinon le rejeu d'apres
    // degel repondrait "deja traite" et l'encaissement serait perdu.
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('status: refuse aussi un simple changement de statut', async () => {
    tenantRow = { ...LIGNE_SERVANTE, subscription_status: 'frozen' };
    mockActionStatus.mockResolvedValue({ success: true });

    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'status', client_request_id: rid, orderId: oid, status: 'delivered' }),
    );

    expect(res.status).toBe(403);
    expect(mockActionStatus).not.toHaveBeenCalled();
  });

  it('laisse passer un restaurant en retard de paiement', async () => {
    tenantRow = { ...LIGNE_SERVANTE, subscription_status: 'past_due' };
    mockActionMarkPaid.mockResolvedValue({ success: true, paid: true });

    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'pay', client_request_id: rid, orderId: oid, method: 'cash' }),
    );

    expect(res.status).toBe(200);
    expect(mockActionMarkPaid).toHaveBeenCalled();
  });

  // Decision produit du 2026-11-09: a la fin d'un essai pas encore gele, les
  // gestes de cuisine passent la coupure de la route. L'action juge ensuite
  // commande par commande (assertTenantServingForKitchen, teste a part).
  describe("fin d'essai pas encore gelee: la cuisine finit ses commandes", () => {
    const ESSAI_EXPIRE = {
      subscription_status: 'trial',
      trial_ends_at: '2020-01-01T00:00:00Z',
      stripe_subscription_id: null,
    };
    const iid = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

    it.each([
      ['status', { type: 'status', orderId: oid, status: 'ready' }, () => mockActionStatus],
      [
        'item_status',
        { type: 'item_status', orderId: oid, itemIds: [iid], status: 'ready' },
        () => mockActionItemStatus,
      ],
      [
        'course_held',
        { type: 'course_held', orderId: oid, course: 'main', held: false },
        () => mockActionCourseHeld,
      ],
    ])('%s: transmis a l action', async (_type, corps, action) => {
      tenantRow = { ...LIGNE_SERVANTE, ...ESSAI_EXPIRE };
      action().mockResolvedValue({ success: true });

      const { POST } = await import('@/app/api/orders/mutations/route');
      const res = await POST(post({ ...corps, client_request_id: rid }));

      expect(res.status).toBe(200);
      expect(action()).toHaveBeenCalled();
    });

    it('pay: reste refuse en 403, sans consommer la cle', async () => {
      tenantRow = { ...LIGNE_SERVANTE, ...ESSAI_EXPIRE };
      const { POST } = await import('@/app/api/orders/mutations/route');
      const res = await POST(
        post({ type: 'pay', client_request_id: rid, orderId: oid, method: 'cash' }),
      );
      expect(res.status).toBe(403);
      expect(mockActionMarkPaid).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('assign: reste refuse en 403', async () => {
      tenantRow = { ...LIGNE_SERVANTE, ...ESSAI_EXPIRE };
      const { POST } = await import('@/app/api/orders/mutations/route');
      const res = await POST(
        post({
          type: 'assign',
          client_request_id: rid,
          tableId: oid,
          serverId: iid,
        }),
      );
      expect(res.status).toBe(403);
      expect(mockActionAssign).not.toHaveBeenCalled();
    });

    it.each([
      ['suspendu par le super-admin', { suspended_at: '2026-11-01T00:00:00Z' }],
      ['deja gele par le cron', { subscription_status: 'frozen', is_active: false }],
    ])('status: refuse quand l essai expire est aussi %s', async (_cas, etat) => {
      tenantRow = { ...LIGNE_SERVANTE, ...ESSAI_EXPIRE, ...etat };
      const { POST } = await import('@/app/api/orders/mutations/route');
      const res = await POST(
        post({ type: 'status', client_request_id: rid, orderId: oid, status: 'ready' }),
      );
      expect(res.status).toBe(403);
      expect(mockActionStatus).not.toHaveBeenCalled();
    });
  });

  it('repond 404 quand le restaurant est introuvable ou supprime', async () => {
    tenantRow = null;

    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'pay', client_request_id: rid, orderId: oid, method: 'cash' }),
    );

    expect(res.status).toBe(404);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
