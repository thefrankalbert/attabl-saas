import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * RES-1 - la route de simulation DEV etait le DIXIEME site d'ecriture de statut
 * du depot, et le seul a ne pas ecrire la cause du gel. L'invariant du projet
 * est "freeze_reason non nulle SI ET SEULEMENT SI subscription_status =
 * 'frozen'": ecrire un statut NON gele sans effacer la cause le rompt, et
 * laissait une cause heritee (par exemple 'dispute') sur un tenant redevenu
 * actif - cause que charge.dispute.closed aurait eu le droit de lever.
 *
 * Portee: dev uniquement (404 si NODE_ENV n'est pas development ou si
 * ALLOW_DEV_PAYMENT_SIM n'est pas 'true'), donc non exploitable en production.
 */

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.stubEnv('NODE_ENV', 'development');
vi.stubEnv('ALLOW_DEV_PAYMENT_SIM', 'true');

import { POST } from '../dev/simulate-subscription/route';

const TENANT_ID = '11111111-2222-4333-8444-555555555555';

function setupMock() {
  const updatePayloads: Record<string, unknown>[] = [];

  mockFrom.mockImplementation((table: string) => {
    if (table !== 'tenants') throw new Error(`Table inattendue: ${table}`);
    return {
      update: vi.fn((payload: Record<string, unknown>) => {
        updatePayloads.push(payload);
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
    };
  });

  return { updatePayloads };
}

function makeRequest(): Request {
  return new Request('https://example.com/api/dev/simulate-subscription', {
    method: 'POST',
    body: JSON.stringify({ tenant_id: TENANT_ID, plan: 'pro', interval: 'monthly' }),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dev/simulate-subscription - invariant de la cause du gel', () => {
  it('efface la cause du gel en ecrivant un statut actif', async () => {
    const chain = setupMock();

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(1);
    expect(chain.updatePayloads[0].subscription_status).toBe('active');
    expect(chain.updatePayloads[0].freeze_reason).toBeNull();
  });
});
