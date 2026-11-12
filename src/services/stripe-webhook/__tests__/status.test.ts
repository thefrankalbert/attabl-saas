import { describe, it, expect } from 'vitest';
import type Stripe from 'stripe';
import { detectBillingInterval, isValidInterval } from '../status';

/** Abonnement Stripe minimal: seul le plan du premier article compte ici. */
function abonnement(
  plan: { interval: string; interval_count: number } | null,
): Stripe.Subscription {
  return { items: { data: plan ? [{ plan }] : [] } } as unknown as Stripe.Subscription;
}

describe('detectBillingInterval', () => {
  it('un prix annuel donne yearly', () => {
    expect(detectBillingInterval(abonnement({ interval: 'year', interval_count: 1 }))).toBe(
      'yearly',
    );
  });

  it('un prix mensuel donne monthly', () => {
    expect(detectBillingInterval(abonnement({ interval: 'month', interval_count: 1 }))).toBe(
      'monthly',
    );
  });

  it('un ancien prix de 6 mois ne recree pas de periode semestrielle', () => {
    // ATTABL ne propose plus que mensuel et annuel (decision du 2026-11-12):
    // la base refuse 'semiannual', donc cette valeur ne doit jamais sortir d'ici.
    expect(detectBillingInterval(abonnement({ interval: 'month', interval_count: 6 }))).toBe(
      'monthly',
    );
  });

  it('un abonnement sans article donne monthly', () => {
    expect(detectBillingInterval(abonnement(null))).toBe('monthly');
  });
});

describe('isValidInterval', () => {
  it('accepte mensuel et annuel, refuse le semestriel', () => {
    expect(isValidInterval('monthly')).toBe(true);
    expect(isValidInterval('yearly')).toBe(true);
    expect(isValidInterval('semiannual')).toBe(false);
    expect(isValidInterval(undefined)).toBe(false);
  });
});
