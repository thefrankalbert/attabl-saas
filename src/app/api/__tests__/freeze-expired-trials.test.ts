import { beforeEach, describe, expect, it, vi } from 'vitest';

// Le cron enchaine deux formes de requete: un UPDATE ... SELECT (essais expires)
// et un SELECT ... LIMIT suivi d'un UPDATE ... IN (impayes, plafonnes). Le
// builder est donc chainable ET thenable: n'importe quel maillon peut terminer
// la chaine, et c'est `mockSelect` qui fournit le resultat.
const mockSelect = vi.fn();
type Builder = Record<string, unknown>;
const builder: Builder = {};
for (const method of ['from', 'update', 'eq', 'lt', 'is', 'in', 'order', 'limit', 'select']) {
  builder[method] = vi.fn(() => builder);
}
builder.then = (resolve: (value: unknown) => unknown) =>
  Promise.resolve(mockSelect()).then(resolve);

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => builder),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe('GET /api/cron/freeze-expired-trials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    mockSelect.mockResolvedValue({ data: [{ id: 'a' }, { id: 'b' }], error: null });
  });

  function createRequest(auth?: string): Request {
    return new Request('http://localhost/api/cron/freeze-expired-trials', {
      method: 'GET',
      headers: auth ? { authorization: auth } : {},
    });
  }

  it('returns 401 without bearer token', async () => {
    const { GET } = await import('@/app/api/cron/freeze-expired-trials/route');
    const response = await GET(createRequest());
    expect(response.status).toBe(401);
  });

  it('returns 503 when CRON_SECRET is missing', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const { GET } = await import('@/app/api/cron/freeze-expired-trials/route');
    const response = await GET(createRequest('Bearer test-cron-secret'));
    expect(response.status).toBe(503);
  });

  it('freezes only expired, never-subscribed trials when authorized', async () => {
    const { GET } = await import('@/app/api/cron/freeze-expired-trials/route');
    const response = await GET(createRequest('Bearer test-cron-secret'));
    const json = (await response.json()) as { success: boolean; frozen: number };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.frozen).toBe(2);
    // Le gel d'impaye est plafonne par execution: la migration retro-remplit
    // tous les impayes avec la meme date, ils franchissent donc le seuil le meme
    // jour. Sans plafond, une seule execution eteindrait toute la population.
    expect(builder.limit).toHaveBeenCalledWith(25);
    // Only trials that expired AND never got a Stripe subscription are frozen.
    // F6: le gel aligne is_active sur le webhook subscription.deleted. Sans lui,
    // la vitrine et POST /api/orders restaient ouverts pour un essai expire.
    //
    // LOT 7: le cron gele pour DEUX causes distinctes (essai expire, impaye
    // depasse). Elles ne partagent plus un seul payload: `charge.dispute.closed`
    // ne doit lever que le gel pose par un litige, donc chaque chemin ecrit la
    // sienne.
    expect(builder.update).toHaveBeenCalledWith({
      subscription_status: 'frozen',
      is_active: false,
      freeze_reason: 'trial_expired',
    });
    expect(builder.eq).toHaveBeenCalledWith('subscription_status', 'trial');
    expect(builder.is).toHaveBeenCalledWith('stripe_subscription_id', null);
  });

  it('gele un impaye depasse avec sa propre cause', async () => {
    const { GET } = await import('@/app/api/cron/freeze-expired-trials/route');
    const response = await GET(createRequest('Bearer test-cron-secret'));
    expect(response.status).toBe(200);

    expect(builder.update).toHaveBeenCalledWith({
      subscription_status: 'frozen',
      is_active: false,
      freeze_reason: 'past_due_overdue',
    });
    expect(builder.in).toHaveBeenCalledWith('id', ['a', 'b']);
  });

  it('rejoue le gel sans la cause quand la colonne n existe pas encore', async () => {
    // Le code part en production AVANT la migration: un 42703 ne doit pas
    // empecher le gel, qui est la direction sure.
    mockSelect
      .mockResolvedValueOnce({
        data: null,
        error: { code: '42703', message: 'column tenants.freeze_reason does not exist' },
      })
      .mockResolvedValue({ data: [{ id: 'a' }], error: null });

    const { GET } = await import('@/app/api/cron/freeze-expired-trials/route');
    const response = await GET(createRequest('Bearer test-cron-secret'));

    expect(response.status).toBe(200);
    expect(builder.update).toHaveBeenCalledWith({
      subscription_status: 'frozen',
      is_active: false,
    });
  });

  it('returns 500 when the update fails', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const { GET } = await import('@/app/api/cron/freeze-expired-trials/route');
    const response = await GET(createRequest('Bearer test-cron-secret'));
    expect(response.status).toBe(500);
  });
});
