import { describe, it, expect } from 'vitest';

import {
  STOREFRONT_GRACE_DAYS,
  menuVisibleDaysLeft,
  storefrontAccess,
  storefrontGraceEndsAt,
  type StorefrontAccessRow,
} from '../storefront-access';

// Decision produit du 2026-11-09: fin d'essai sans abonnement = 7 jours de
// carte en lecture seule, puis vitrine fermee. Aucune grace pour une
// suspension, un autre gel ou une desactivation.

const JOUR = 24 * 60 * 60 * 1000;
const FIN_ESSAI = '2026-11-09T08:00:00Z';
const T0 = Date.parse(FIN_ESSAI);

const servant: StorefrontAccessRow = {
  is_active: true,
  suspended_at: null,
  subscription_status: 'active',
  trial_ends_at: null,
};

// Essai expire, cron pas encore passe: actif, statut `trial`, sans abonnement.
const essaiExpire: StorefrontAccessRow = {
  is_active: true,
  suspended_at: null,
  subscription_status: 'trial',
  trial_ends_at: FIN_ESSAI,
  stripe_subscription_id: null,
};

// Ce que le cron ecrit (freeze-expired-trials).
const geleParLeCron: StorefrontAccessRow = {
  is_active: false,
  suspended_at: null,
  subscription_status: 'frozen',
  freeze_reason: 'trial_expired',
  trial_ends_at: FIN_ESSAI,
};

describe('storefrontAccess', () => {
  it('restaurant qui sert: ouvert', () => {
    expect(storefrontAccess(servant, T0)).toBe('open');
  });

  it('essai en cours: ouvert', () => {
    expect(storefrontAccess(essaiExpire, T0 - JOUR)).toBe('open');
  });

  it('essai expire, pas encore gele: lecture seule pendant 7 jours', () => {
    expect(storefrontAccess(essaiExpire, T0 + 1)).toBe('read_only');
    expect(storefrontAccess(essaiExpire, T0 + 6 * JOUR)).toBe('read_only');
  });

  it('essai expire mais abonnement Stripe ouvert: ouvert', () => {
    expect(storefrontAccess({ ...essaiExpire, stripe_subscription_id: 'sub_1' }, T0 + JOUR)).toBe(
      'open',
    );
  });

  it('gel `trial_expired` du cron: lecture seule dans les 7 jours', () => {
    expect(storefrontAccess(geleParLeCron, T0 + 3 * JOUR)).toBe('read_only');
  });

  it('au-dela de 7 jours: fermee', () => {
    const fin = storefrontGraceEndsAt(FIN_ESSAI);
    expect(storefrontAccess(geleParLeCron, fin - 1)).toBe('read_only');
    expect(storefrontAccess(geleParLeCron, fin)).toBe('closed');
    expect(storefrontAccess(essaiExpire, fin + JOUR)).toBe('closed');
  });

  it("suspension plateforme: fermee tout de suite, meme en fin d'essai", () => {
    const suspendu = { suspended_at: '2026-11-09T09:00:00Z' };
    expect(storefrontAccess({ ...geleParLeCron, ...suspendu }, T0 + JOUR)).toBe('closed');
    expect(storefrontAccess({ ...essaiExpire, ...suspendu }, T0 + JOUR)).toBe('closed');
    expect(storefrontAccess({ ...servant, ...suspendu }, T0)).toBe('closed');
  });

  it('gel pour une autre cause: aucune grace', () => {
    for (const cause of ['dispute', 'stripe_unpaid', 'past_due_overdue', 'refund', null]) {
      expect(storefrontAccess({ ...geleParLeCron, freeze_reason: cause }, T0 + JOUR)).toBe(
        'closed',
      );
    }
  });

  it('gel sans cause lue (colonne absente du select): aucune grace', () => {
    const sansCause: StorefrontAccessRow = { ...geleParLeCron };
    delete sansCause.freeze_reason;
    expect(storefrontAccess(sansCause, T0 + JOUR)).toBe('closed');
  });

  it('desactive pour une autre raison, ou resilie: aucune grace', () => {
    expect(storefrontAccess({ ...essaiExpire, is_active: false }, T0 + JOUR)).toBe('closed');
    expect(
      storefrontAccess(
        {
          ...servant,
          is_active: false,
          subscription_status: 'cancelled',
          trial_ends_at: FIN_ESSAI,
        },
        T0 + JOUR,
      ),
    ).toBe('closed');
  });
});

describe('menuVisibleDaysLeft', () => {
  it('compte les jours restants, arrondis au jour superieur', () => {
    expect(STOREFRONT_GRACE_DAYS).toBe(7);
    expect(menuVisibleDaysLeft(FIN_ESSAI, T0 + 1)).toBe(7);
    expect(menuVisibleDaysLeft(FIN_ESSAI, T0 + 6 * JOUR + 1)).toBe(1);
  });
});
