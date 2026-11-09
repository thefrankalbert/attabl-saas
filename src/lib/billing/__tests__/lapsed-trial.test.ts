import { describe, it, expect, vi } from 'vitest';

import {
  isTrialLapsedForTenant,
  menuVisibleDaysLeftForTenant,
  resolveDisplayedSubscriptionStatus,
  storefrontAccessForTenant,
} from '../lapsed-trial';

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

describe('storefrontAccessForTenant - meme lecture service_role que la garde', () => {
  const expireActif = { ...expire, is_active: true, suspended_at: null };

  it('essai expire sans abonnement: carte en lecture seule', async () => {
    const load = vi.fn().mockResolvedValue({ stripe_subscription_id: null });
    await expect(storefrontAccessForTenant('t1', expireActif, load, MAINTENANT)).resolves.toBe(
      'read_only',
    );
    expect(load).toHaveBeenCalledWith('t1');
  });

  it('essai expire mais abonnement Stripe ouvert: carte ouverte', async () => {
    const load = vi.fn().mockResolvedValue({ stripe_subscription_id: 'sub_123' });
    await expect(storefrontAccessForTenant('t1', expireActif, load, MAINTENANT)).resolves.toBe(
      'open',
    );
  });

  it('lecture en echec: lecture seule, jamais ouverte', async () => {
    const load = vi.fn().mockRejectedValue(new Error('panne'));
    await expect(storefrontAccessForTenant('t1', expireActif, load, MAINTENANT)).resolves.toBe(
      'read_only',
    );
  });

  it('gel du cron: aucune lecture service_role, la cause suffit', async () => {
    const load = vi.fn();
    const gele = {
      is_active: false,
      suspended_at: null,
      subscription_status: 'frozen',
      freeze_reason: 'trial_expired',
      trial_ends_at: expire.trial_ends_at,
    };
    await expect(storefrontAccessForTenant('t1', gele, load, MAINTENANT)).resolves.toBe(
      'read_only',
    );
    expect(load).not.toHaveBeenCalled();
  });
});

describe('menuVisibleDaysLeftForTenant - compte a rebours du bandeau admin', () => {
  const sansAbonnement = () => vi.fn().mockResolvedValue({ stripe_subscription_id: null });

  it('essai expire il y a 4 h: 7 jours de carte visible', async () => {
    const row = { ...expire, is_active: true, suspended_at: null };
    await expect(
      menuVisibleDaysLeftForTenant('t1', row, sansAbonnement(), MAINTENANT),
    ).resolves.toBe(7);
  });

  it('gel du cron il y a 3 jours et 4 h: 4 jours', async () => {
    const row = {
      is_active: false,
      suspended_at: null,
      subscription_status: 'frozen',
      freeze_reason: 'trial_expired',
      trial_ends_at: '2026-11-06T08:00:00Z',
    };
    await expect(menuVisibleDaysLeftForTenant('t1', row, vi.fn(), MAINTENANT)).resolves.toBe(4);
  });

  it('essai en cours: aucun compte a rebours', async () => {
    const row = { ...enCours, is_active: true, suspended_at: null };
    await expect(
      menuVisibleDaysLeftForTenant('t1', row, sansAbonnement(), MAINTENANT),
    ).resolves.toBeNull();
  });

  it('gel pour une autre cause (litige): aucun compte a rebours', async () => {
    const row = {
      is_active: false,
      suspended_at: null,
      subscription_status: 'frozen',
      freeze_reason: 'dispute',
      trial_ends_at: expire.trial_ends_at,
    };
    await expect(menuVisibleDaysLeftForTenant('t1', row, vi.fn(), MAINTENANT)).resolves.toBeNull();
  });

  it('essai expire mais suspendu par la plateforme: aucun compte a rebours', async () => {
    const row = { ...expire, is_active: true, suspended_at: '2026-11-09T09:00:00Z' };
    await expect(
      menuVisibleDaysLeftForTenant('t1', row, sansAbonnement(), MAINTENANT),
    ).resolves.toBeNull();
  });

  it('plus de 7 jours apres la fin de l essai: aucun compte a rebours', async () => {
    const row = {
      is_active: false,
      suspended_at: null,
      subscription_status: 'frozen',
      freeze_reason: 'trial_expired',
      trial_ends_at: '2026-11-01T08:00:00Z',
    };
    await expect(menuVisibleDaysLeftForTenant('t1', row, vi.fn(), MAINTENANT)).resolves.toBeNull();
  });
});
