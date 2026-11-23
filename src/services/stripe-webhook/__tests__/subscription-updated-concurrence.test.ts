import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/stripe/server', () => ({
  getPlanFromPriceId: () => null,
  getIntervalFromPriceId: () => null,
}));

import { handleSubscriptionUpdated } from '../subscription';
import { ServiceError } from '../../errors';

/**
 * Audit B98: `customer.subscription.updated` lit le restaurant, interroge
 * Stripe, puis ecrivait en ne filtrant que par `id`. Un gel pose entre-temps
 * par un autre evenement (litige, remboursement, cron) etait efface et le
 * restaurant repassait `active`.
 *
 * Les doublures partagees (banc-doublures.ts) n'appliquent pas les filtres
 * d'ecriture: cette fausse table les applique (eq / is) et rend le nombre de
 * lignes touchees, comme PostgREST avec `count: 'exact'`.
 */
function baseVivante(ligne: Record<string, unknown>) {
  const filtresVus: [string, unknown][][] = [];
  const supabase = {
    from: () => ({
      select: () => {
        const chaine = {
          eq: () => chaine,
          single: () => Promise.resolve({ data: { ...ligne }, error: null }),
          maybeSingle: () => Promise.resolve({ data: { ...ligne }, error: null }),
        };
        return chaine;
      },
      update: (payload: Record<string, unknown>) => {
        const filtres: [string, unknown][] = [];
        filtresVus.push(filtres);
        const chaine = {
          eq: (c: string, v: unknown) => (filtres.push([c, v]), chaine),
          is: (c: string, v: unknown) => (filtres.push([c, v]), chaine),
          then: (ok: (r: { error: null; count: number }) => unknown) => {
            const touche = filtres.every(([c, v]) => ligne[c] === v);
            if (touche) Object.assign(ligne, payload);
            return Promise.resolve({ error: null, count: touche ? 1 : 0 }).then(ok);
          },
        };
        return chaine;
      },
    }),
  } as unknown as SupabaseClient;
  return { supabase, ligne, filtresVus };
}

const actif = () => ({
  id: 't1',
  subscription_status: 'active' as string | null,
  subscription_plan: 'pro',
  billing_interval: 'monthly',
  stripe_subscription_id: 'sub_1',
  suspended_at: null,
  deleted_at: null,
  freeze_reason: null,
  is_active: true,
});

const evenement = {
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
} as unknown as Stripe.Subscription;

/** Litige ouvert chez Stripe sur un paiement du client. */
const litigeOuvert = {
  charges: { list: vi.fn(async () => ({ data: [{ id: 'ch_1', disputed: true }] })) },
  disputes: { list: vi.fn(async () => ({ data: [{ id: 'dp_1', status: 'needs_response' }] })) },
};

describe('customer.subscription.updated: garde optimiste sur le statut lu (B98)', () => {
  it('un gel pose PENDANT la relecture Stripe n est pas efface; Stripe rejouera', async () => {
    const { supabase, ligne } = baseVivante(actif());
    const stripe = {
      subscriptions: {
        // Pendant cet appel reseau, charge.dispute.created gele le restaurant.
        retrieve: vi.fn(async () => {
          Object.assign(ligne, {
            subscription_status: 'frozen',
            is_active: false,
            freeze_reason: 'dispute',
          });
          return { id: 'sub_1', status: 'active', items: { data: [] } };
        }),
      },
      ...litigeOuvert,
    } as unknown as Stripe;

    const err = await handleSubscriptionUpdated({ supabase, stripe }, evenement).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).code).toBe('INTERNAL');
    expect(ligne).toMatchObject({
      subscription_status: 'frozen',
      is_active: false,
      freeze_reason: 'dispute',
    });

    // Le rejeu de Stripe relit la ligne a jour: le litige est toujours ouvert,
    // le restaurant reste gele, sans erreur.
    const stripeRejeu = {
      subscriptions: {
        retrieve: vi.fn(async () => ({ id: 'sub_1', status: 'active', items: { data: [] } })),
      },
      ...litigeOuvert,
    } as unknown as Stripe;
    await handleSubscriptionUpdated({ supabase, stripe: stripeRejeu }, evenement);
    expect(ligne).toMatchObject({ subscription_status: 'frozen', freeze_reason: 'dispute' });
  });

  it('temoin: sans ecriture concurrente, la mise a jour aboutit et porte la garde', async () => {
    const { supabase, ligne, filtresVus } = baseVivante(actif());
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => ({ id: 'sub_1', status: 'past_due', items: { data: [] } })),
      },
      ...litigeOuvert,
    } as unknown as Stripe;

    await handleSubscriptionUpdated({ supabase, stripe }, evenement);

    expect(filtresVus.at(-1)).toEqual([
      ['id', 't1'],
      ['subscription_status', 'active'],
    ]);
    expect(ligne.subscription_status).toBe('past_due');
  });

  it('statut lu NULL: la garde utilise `is null`, et l ecriture aboutit', async () => {
    const { supabase, ligne, filtresVus } = baseVivante({ ...actif(), subscription_status: null });
    const stripe = {
      subscriptions: {
        retrieve: vi.fn(async () => ({ id: 'sub_1', status: 'active', items: { data: [] } })),
      },
      ...litigeOuvert,
    } as unknown as Stripe;

    await handleSubscriptionUpdated({ supabase, stripe }, evenement);

    expect(filtresVus.at(-1)).toContainEqual(['subscription_status', null]);
    expect(ligne.subscription_status).toBe('active');
  });
});
