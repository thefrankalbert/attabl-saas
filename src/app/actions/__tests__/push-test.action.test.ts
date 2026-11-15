import { beforeEach, describe, expect, it, vi } from 'vitest';

const envoyer = vi.fn();
vi.mock('@/services/push.service', () => ({
  createPushService: () => ({ envoyerAuxAppareilsDuTenant: envoyer }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
const check = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/rate-limit', () => ({ pushSubscriptionLimiter: { check } }));

const tenantRow = { slug: 'resto', default_locale: 'fr-FR' };
const supabase = {
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tenantRow, error: null }) }) }),
  }),
};
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserWithTenant: async () => ({
    tenantId: 'tenant-1',
    adminUserId: 'membre-1',
    supabase,
  }),
}));

const { actionSendTestAlert } = await import('../push-test');

describe('actionSendTestAlert', () => {
  beforeEach(() => envoyer.mockReset());

  it('envoie une alerte urgente a la personne connectee, et a elle seule', async () => {
    envoyer.mockResolvedValue({ envoyees: 1, expirees: 0, echecs: 0, refuses: 0 });
    const res = await actionSendTestAlert();
    expect(res).toEqual({ success: true, sent: 1 });
    expect(envoyer).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ alerte: true, slug: 'resto' }),
      { membres: ['membre-1'] },
    );
  });

  it('dit clairement quand aucun appareil n a recu le test', async () => {
    envoyer.mockResolvedValue({ envoyees: 0, expirees: 0, echecs: 0, refuses: 0 });
    const res = await actionSendTestAlert();
    expect(res).toEqual({ success: false, error: 'noDevice' });
  });

  it('limite les essais repetes, sans rien envoyer', async () => {
    check.mockResolvedValueOnce({ success: false });
    const res = await actionSendTestAlert();
    expect(res).toEqual({ success: false, error: 'tooMany' });
    expect(envoyer).not.toHaveBeenCalled();
  });
});
