import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderMutationSchema } from '@/lib/validations/order-mutation.schema';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockRateLimitCheck = vi.fn<() => Promise<{ success: boolean }>>();
const mockSettlementLimitCheck = vi.fn<() => Promise<{ success: boolean }>>();
vi.mock('@/lib/rate-limit', () => ({
  assignmentLimiter: { check: () => mockRateLimitCheck() },
  orderSettlementLimiter: { check: () => mockSettlementLimitCheck() },
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
vi.mock('@/app/actions/orders', () => ({
  actionUpdateOrderStatus: (...a: unknown[]) => mockActionStatus(...a),
  actionMarkOrderPaid: (...a: unknown[]) => mockActionMarkPaid(...a),
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

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
      from: (table: string) => {
        if (table === 'tenants') {
          return {
            select: () => ({
              eq: () => ({ is: () => ({ single: () => Promise.resolve({ data: { id: 't1' } }) }) }),
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
