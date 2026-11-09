import { describe, it, expect, vi } from 'vitest';

import { isTrialLapsedForTenant, resolveDisplayedSubscriptionStatus } from '../lapsed-trial';

// Le chargeur par defaut lit en service_role ('server-only'). Chaque test
// injecte le sien; ce mock prouve qu'aucun ne retombe sur le client reel.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('client service_role reel appele dans un test');
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const MAINTENANT = Date.parse('2026-11-09T12:00:00Z');
const expire = { subscription_status: 'trial', trial_ends_at: '2026-11-09T08:00:00Z' };
const enCours = { subscription_status: 'trial', trial_ends_at: '2026-11-12T08:00:00Z' };

describe('resolveDisplayedSubscriptionStatus - essai expire avant le cron', () => {
  it('essai expire sans abonnement Stripe: montre frozen (bandeau + renvoi)', async () => {
    const load = vi.fn().mockResolvedValue({ stripe_subscription_id: null });
    await expect(resolveDisplayedSubscriptionStatus('t1', expire, load, MAINTENANT)).resolves.toBe(
      'frozen',
    );
    expect(load).toHaveBeenCalledWith('t1');
  });

  it('essai expire mais abonnement Stripe ouvert: reste trial', async () => {
    const load = vi.fn().mockResolvedValue({ stripe_subscription_id: 'sub_123' });
    await expect(resolveDisplayedSubscriptionStatus('t1', expire, load, MAINTENANT)).resolves.toBe(
      'trial',
    );
  });

  it('lecture des identifiants en echec: montre frozen, comme la garde serveur', async () => {
    const load = vi.fn().mockRejectedValue(new Error('panne'));
    await expect(resolveDisplayedSubscriptionStatus('t1', expire, load, MAINTENANT)).resolves.toBe(
      'frozen',
    );
  });

  it('essai en cours: reste trial, sans lecture service_role', async () => {
    const load = vi.fn();
    await expect(resolveDisplayedSubscriptionStatus('t1', enCours, load, MAINTENANT)).resolves.toBe(
      'trial',
    );
    expect(load).not.toHaveBeenCalled();
  });

  it('restaurant abonne: statut inchange, sans lecture service_role', async () => {
    const load = vi.fn();
    await expect(
      resolveDisplayedSubscriptionStatus(
        't1',
        { subscription_status: 'active', trial_ends_at: '2026-11-01T00:00:00Z' },
        load,
        MAINTENANT,
      ),
    ).resolves.toBe('active');
    expect(load).not.toHaveBeenCalled();
  });
});

describe('isTrialLapsedForTenant', () => {
  it('restaurant introuvable a la relecture: compte comme sans abonnement', async () => {
    const load = vi.fn().mockResolvedValue(null);
    await expect(isTrialLapsedForTenant('t1', expire, load, MAINTENANT)).resolves.toBe(true);
  });
});
