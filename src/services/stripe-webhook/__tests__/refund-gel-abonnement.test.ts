import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleInvoicePaid } from '../invoice';
import { handleSubscriptionDeleted } from '../subscription';
import { ServiceError } from '../../errors';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

/**
 * Audit B94: le gel pour remboursement etait leve par `invoice.paid` sans
 * relire l'abonnement chez Stripe. Un restaurant gele pour `refund`, dont
 * l'abonnement est ensuite supprime, repassait `active` sur un `invoice.paid`
 * rejoue ou arrive hors ordre, sans plus aucun abonnement.
 *
 * Fausse table `tenants` qui APPLIQUE les filtres eq / is / or envoyes par le
 * code: une ecriture ne touche que les lignes qui les satisfont.
 */
type Row = Record<string, unknown>;
type Filtre = [string, string, unknown];

function fausseBase(row: Row) {
  const rows = [row];
  const match = (r: Row, f: Filtre[]) =>
    f.every(([op, c, v]) => {
      if (op === 'eq' || op === 'is') return r[c] === v;
      // or("refund_frozen_at.is.null,refund_frozen_at.lt.\"ISO\"")
      const [a, b] = String(v).split(',');
      const col = a.split('.')[0];
      const iso = b.slice(b.indexOf('"') + 1, b.lastIndexOf('"'));
      const val = r[col];
      return val === null || (typeof val === 'string' && Date.parse(val) < Date.parse(iso));
    });
  const ecritures: Row[] = [];
  const from = () => ({
    select: () => {
      const f: Filtre[] = [];
      const ch: Record<string, unknown> = {
        eq: (c: string, v: unknown) => (f.push(['eq', c, v]), ch),
        single: async () => ({ data: rows.find((r) => match(r, f)) ?? null, error: null }),
        maybeSingle: async () => ({ data: rows.find((r) => match(r, f)) ?? null, error: null }),
      };
      return ch;
    },
    update: (payload: Row) => {
      const f: Filtre[] = [];
      const ch: Record<string, unknown> = {
        eq: (c: string, v: unknown) => (f.push(['eq', c, v]), ch),
        is: (c: string, v: unknown) => (f.push(['is', c, v]), ch),
        or: (v: string) => (f.push(['or', '', v]), ch),
        then: (ok: (x: unknown) => unknown) => {
          rows
            .filter((r) => match(r, f))
            .forEach((r) => {
              ecritures.push(payload);
              Object.assign(r, payload);
            });
          return Promise.resolve({ error: null }).then(ok);
        },
      };
      return ch;
    },
  });
  return { supabase: { from } as unknown as SupabaseClient, row, ecritures };
}

function fauxStripe(retrieve: () => Promise<unknown>) {
  const s = { subscriptions: { retrieve: vi.fn(retrieve) } };
  return { stripe: s as unknown as Stripe, retrieve: s.subscriptions.retrieve };
}
const introuvable = () =>
  Promise.reject(Object.assign(new Error('No such'), { code: 'resource_missing' }));
const panne = () => Promise.reject(new Error('timeout'));
const statut = (status: string) => () => Promise.resolve({ id: 'sub_1', status });

const T1 = '2026-11-01T10:00:00.000Z'; // gel pour remboursement
const T2 = Math.floor(Date.parse('2026-11-05T10:00:00.000Z') / 1000); // facture payee apres

function geleRemboursement(): Row {
  return {
    id: 't1',
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1',
    subscription_status: 'frozen',
    freeze_reason: 'refund',
    refund_frozen_at: T1,
    is_active: false,
    suspended_at: null,
    deleted_at: null,
  };
}

const facture = (over: Record<string, unknown> = {}): Stripe.Invoice =>
  ({
    id: 'in_2',
    customer: 'cus_1',
    amount_paid: 5000,
    created: T2,
    status_transitions: { paid_at: T2 },
    parent: { subscription_details: { subscription: 'sub_1' } },
    ...over,
  }) as unknown as Stripe.Invoice;

describe('invoice.paid: levee du gel pour remboursement (B94)', () => {
  it('temoin: abonnement en regle chez Stripe, le gel est leve comme avant', async () => {
    const { supabase, row } = fausseBase(geleRemboursement());
    const { stripe, retrieve } = fauxStripe(statut('active'));
    await handleInvoicePaid({ supabase, stripe }, facture());
    expect(retrieve).toHaveBeenCalledWith('sub_1');
    expect(row).toMatchObject({
      subscription_status: 'active',
      is_active: true,
      freeze_reason: null,
    });
  });

  it('abonnement annule chez Stripe: le gel reste', async () => {
    const { supabase, row } = fausseBase(geleRemboursement());
    const { stripe } = fauxStripe(statut('canceled'));
    await handleInvoicePaid({ supabase, stripe }, facture());
    expect(row).toMatchObject({ subscription_status: 'frozen', freeze_reason: 'refund' });
  });

  it('abonnement introuvable chez Stripe: le gel reste, evenement consomme', async () => {
    const { supabase, row } = fausseBase(geleRemboursement());
    const { stripe } = fauxStripe(introuvable);
    await expect(handleInvoicePaid({ supabase, stripe }, facture())).resolves.toBeUndefined();
    expect(row).toMatchObject({ subscription_status: 'frozen', freeze_reason: 'refund' });
  });

  it('Stripe illisible: leve INTERNAL pour que Stripe rejoue, le gel reste', async () => {
    const { supabase, row } = fausseBase(geleRemboursement());
    const { stripe } = fauxStripe(panne);
    const err = await handleInvoicePaid({ supabase, stripe }, facture()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).code).toBe('INTERNAL');
    expect(row.subscription_status).toBe('frozen');
  });

  it('temoin: le filtre de date reste: une facture payee AVANT le gel ne leve rien', async () => {
    const { supabase, row } = fausseBase(geleRemboursement());
    const { stripe } = fauxStripe(statut('active'));
    const avant = Math.floor(Date.parse('2026-10-20T10:00:00.000Z') / 1000);
    await handleInvoicePaid(
      { supabase, stripe },
      facture({ created: avant, status_transitions: { paid_at: avant } }),
    );
    expect(row.subscription_status).toBe('frozen');
  });

  it('temoin: restaurant non gele, aucune relecture de Stripe', async () => {
    const r = geleRemboursement();
    Object.assign(r, { subscription_status: 'active', freeze_reason: null, is_active: true });
    const { supabase } = fausseBase(r);
    const { stripe, retrieve } = fauxStripe(panne);
    await handleInvoicePaid({ supabase, stripe }, facture());
    expect(retrieve).not.toHaveBeenCalled();
  });
});

describe('garde M-02 de invoice.paid: facture d un autre abonnement', () => {
  it('ne touche pas le restaurant, ni son impaye ni son gel', async () => {
    const r = geleRemboursement();
    Object.assign(r, { subscription_status: 'past_due', freeze_reason: null });
    const { supabase, row, ecritures } = fausseBase(r);
    const { stripe } = fauxStripe(statut('active'));
    await handleInvoicePaid(
      { supabase, stripe },
      facture({ parent: { subscription_details: { subscription: 'sub_AUTRE' } } }),
    );
    expect(ecritures).toEqual([]);
    expect(row.subscription_status).toBe('past_due');
  });

  it('temoin: facture de l abonnement courant, l impaye est leve', async () => {
    const r = geleRemboursement();
    Object.assign(r, { subscription_status: 'past_due', freeze_reason: null });
    const { supabase, row } = fausseBase(r);
    const { stripe } = fauxStripe(statut('active'));
    await handleInvoicePaid({ supabase, stripe }, facture());
    expect(row.subscription_status).toBe('active');
  });
});

describe('customer.subscription.deleted sur un restaurant gele pour remboursement (B94)', () => {
  it('passe la cause a subscription_deleted et efface l abonnement: plus aucun paiement ne degele', async () => {
    const { supabase, row } = fausseBase(geleRemboursement());
    const { stripe } = fauxStripe(statut('active'));
    await handleSubscriptionDeleted({ supabase, stripe }, {
      id: 'sub_1',
      customer: 'cus_1',
    } as unknown as Stripe.Subscription);
    expect(row).toMatchObject({
      subscription_status: 'frozen',
      freeze_reason: 'subscription_deleted',
      stripe_subscription_id: null,
    });

    // Rejeu hors ordre d'une facture payee de l'ancien abonnement, meme si
    // une relecture Stripe repondait "active": rien ne degele.
    await handleInvoicePaid({ supabase, stripe }, facture());
    expect(row).toMatchObject({ subscription_status: 'frozen', is_active: false });
  });

  it('temoin: un gel d une autre cause (litige) n est pas reecrit', async () => {
    const r = geleRemboursement();
    Object.assign(r, { freeze_reason: 'dispute' });
    const { supabase, row } = fausseBase(r);
    const { stripe } = fauxStripe(statut('active'));
    await handleSubscriptionDeleted({ supabase, stripe }, {
      id: 'sub_1',
      customer: 'cus_1',
    } as unknown as Stripe.Subscription);
    expect(row).toMatchObject({ freeze_reason: 'dispute', stripe_subscription_id: 'sub_1' });
  });
});
