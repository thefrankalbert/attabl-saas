import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/stripe/server', () => ({
  getPlanFromPriceId: () => null,
  getIntervalFromPriceId: () => null,
}));

import { handleSubscriptionDeleted, handleSubscriptionUpdated } from '../subscription';
import { doublureBase, doublureStripe } from './banc-doublures';

/**
 * Un restaurant paye par Flutterwave n'a PAS d'identifiant d'abonnement Stripe
 * (efface a l'application du paiement). Sans garde, un evenement tardif d'un
 * ancien abonnement Stripe etait accepte ("restaurant sans abonnement
 * enregistre") et gelait un restaurant qui paie. Mesure dans les deux sens.
 */

const NOW_ISO = new Date().toISOString();
const FUTUR = new Date(Date.now() + 10 * 86_400_000).toISOString();

const tenantSansStripe = {
  id: 'tenant-1',
  subscription_status: 'active',
  subscription_plan: 'pro',
  billing_interval: 'monthly',
  stripe_subscription_id: null,
  suspended_at: null,
  deleted_at: null,
  freeze_reason: null,
};

/** Supabase: `tenants` via la doublure commune, `flutterwave_payments` selon les lignes fournies. */
function supabaseAvec(tenant: Record<string, unknown>, paiements: Record<string, unknown>[]) {
  const base = doublureBase(tenant);
  const filtres: [string, unknown][] = [];
  const chaine: Record<string, unknown> = {};
  for (const m of ['select', 'limit']) chaine[m] = () => chaine;
  for (const m of ['eq', 'gt']) {
    chaine[m] = (col: string, val: unknown) => {
      filtres.push([col, val]);
      return chaine;
    };
  }
  chaine.then = (ok: (v: unknown) => unknown) =>
    Promise.resolve({
      data: paiements.filter((p) => String(p.period_end) > NOW_ISO),
      error: null,
    }).then(ok);
  const supabase = {
    from: (table: string) =>
      table === 'flutterwave_payments' ? chaine : (base.supabase as SupabaseClient).from(table),
  } as unknown as SupabaseClient;
  return { supabase, ecritures: base.ecritures, filtres };
}

const evenement = (id = 'sub_ancien') =>
  ({
    id,
    customer: 'cus_1',
    status: 'canceled',
    items: { data: [] },
    cancellation_details: null,
  }) as unknown as Stripe.Subscription;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('evenements Stripe sur un restaurant paye par Flutterwave', () => {
  const paye = [{ tenant_id: 'tenant-1', status: 'successful', period_end: FUTUR }];

  it('customer.subscription.deleted: ignore, le restaurant n est PAS gele', async () => {
    const { supabase, ecritures, filtres } = supabaseAvec(tenantSansStripe, paye);
    const { stripe } = doublureStripe();
    await handleSubscriptionDeleted({ supabase, stripe }, evenement());
    expect(ecritures).toEqual([]);
    expect(filtres).toContainEqual(['tenant_id', 'tenant-1']);
  });

  it('customer.subscription.updated: ignore, Stripe n est meme pas interroge', async () => {
    const { supabase, ecritures } = supabaseAvec(tenantSansStripe, paye);
    const { stripe, retrieve } = doublureStripe();
    await handleSubscriptionUpdated({ supabase, stripe }, evenement());
    expect(ecritures).toEqual([]);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('temoin negatif: sans paiement Flutterwave, le meme evenement est traite comme avant (gel)', async () => {
    const { supabase, ecritures } = supabaseAvec(tenantSansStripe, []);
    const { stripe } = doublureStripe();
    await handleSubscriptionDeleted({ supabase, stripe }, evenement());
    expect(ecritures.length).toBeGreaterThan(0);
    expect(ecritures[0]).toMatchObject({ subscription_status: 'frozen' });
  });

  it('temoin negatif: une periode Flutterwave TERMINEE ne protege plus', async () => {
    const termine = [
      { tenant_id: 'tenant-1', status: 'successful', period_end: '2020-01-01T00:00:00.000Z' },
    ];
    const { supabase, ecritures } = supabaseAvec(tenantSansStripe, termine);
    const { stripe } = doublureStripe();
    await handleSubscriptionDeleted({ supabase, stripe }, evenement());
    expect(ecritures.length).toBeGreaterThan(0);
  });

  it('un restaurant AVEC un identifiant Stripe ne declenche aucune lecture Flutterwave', async () => {
    const lecture = vi.fn();
    const base = doublureBase({ ...tenantSansStripe, stripe_subscription_id: 'sub_ancien' });
    const supabase = {
      from: (t: string) => {
        if (t === 'flutterwave_payments') lecture();
        return (base.supabase as SupabaseClient).from(t);
      },
    } as unknown as SupabaseClient;
    const { stripe } = doublureStripe();
    await handleSubscriptionDeleted({ supabase, stripe }, evenement('sub_ancien'));
    expect(lecture).not.toHaveBeenCalled();
    expect(base.ecritures.length).toBeGreaterThan(0);
  });
});
