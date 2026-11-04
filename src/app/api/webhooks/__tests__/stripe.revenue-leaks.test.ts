import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

/**
 * Deux fuites de revenu du webhook Stripe, chacune reproduite ici AVANT son
 * correctif.
 *
 * ACT-18 - `charge.dispute.closed` gagne ecrivait `active` sur tout tenant
 * `frozen`. Or `frozen` est l'etat de gel GENERIQUE: il est aussi pose par
 * `customer.subscription.deleted` et par le cron des essais expires. Un litige
 * gagne rendait donc un plan payant actif, sans abonnement Stripe derriere et
 * sans borne de temps.
 *
 * ACT-19 - `invoice.payment_failed` ne testait que `past_due` avant d'ecrire.
 * Un tenant `frozen` qui recevait un impaye repassait `past_due`, statut que le
 * projet declare entitlant: l'impaye RE-OUVRAIT l'acces. Ce gestionnaire etait
 * en plus le seul a ne pas reecrire `is_active`, laissant un statut entitlant
 * avec une vitrine eteinte.
 */

const { mockConstructEvent, mockSubscriptionsRetrieve, mockChargesList } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
  // LOT 7: avant de LEVER un gel, charge.dispute.closed relit les litiges
  // encore ouverts du client. Sans ce double, l'appel leve et le gestionnaire
  // reste gele (fail-closed), ce qui masquerait les tests de degel.
  mockChargesList: vi.fn(),
}));

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn((key: string) => (key === 'stripe-signature' ? 'sig_test' : null)),
    }),
  ),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_fake');

vi.mock('@/lib/stripe/server', () => ({
  getStripe: vi.fn().mockReturnValue({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
    charges: { list: mockChargesList },
  }),
  STRIPE_PRICES: {},
  getPlanFromPriceId: vi.fn().mockReturnValue(null),
  getIntervalFromPriceId: vi.fn().mockReturnValue(null),
}));

import { POST } from '../stripe/route';

// ---------------------------------------------------------------------------
// Doubles Supabase
// ---------------------------------------------------------------------------

/** Maillon `.eq()` chainable ET attendable, comme un builder postgrest. */
interface EqChain extends PromiseLike<{ error: unknown }> {
  eq: (column: string, value: unknown) => EqChain;
}

function makeEqChain(
  result: { error: unknown },
  onEq: (column: string, value: unknown) => void,
): EqChain {
  const chain: EqChain = {
    eq: (column, value) => {
      onEq(column, value);
      return chain;
    },
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return chain;
}

interface TenantsMockOptions {
  /** Ligne tenant renvoyee par le select, ou null (tenant introuvable). */
  tenant?: Record<string, unknown> | null;
  updateError?: unknown;
}

/**
 * Double minimal pour les deux gestionnaires testes:
 *   from('stripe_events').insert().select().maybeSingle()  (idempotence)
 *   from('tenants').select(cols).eq().maybeSingle() | .single()
 *   from('tenants').update(payload).eq()...
 */
function setupTenantsMock(options: TenantsMockOptions = {}) {
  const updatePayloads: Record<string, unknown>[] = [];
  const updateFilters: [string, unknown][] = [];
  const selectedColumns: string[] = [];

  const tenantRow = options.tenant === undefined ? { id: 'tenant-1' } : options.tenant;

  mockFrom.mockImplementation((table: string) => {
    if (table === 'stripe_events') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'evt_test' }, error: null }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }

    if (table === 'tenants') {
      const terminal = {
        maybeSingle: vi.fn().mockResolvedValue({
          data: tenantRow,
          error: tenantRow ? null : { message: 'not found' },
        }),
        single: vi.fn().mockResolvedValue({
          data: tenantRow,
          error: tenantRow ? null : { message: 'not found' },
        }),
      };
      const selectChain = {
        eq: vi.fn(() => selectChain),
        ...terminal,
      };
      return {
        select: vi.fn((columns: string) => {
          selectedColumns.push(columns);
          return selectChain;
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayloads.push(payload);
          return makeEqChain({ error: options.updateError ?? null }, (column, value) =>
            updateFilters.push([column, value]),
          );
        }),
      };
    }

    throw new Error(`Table inattendue: ${table}`);
  });

  return { updatePayloads, updateFilters, selectedColumns };
}

function makeStripeEvent(type: string, object: Record<string, unknown>): Stripe.Event {
  return { id: 'evt_test', type, data: { object } } as unknown as Stripe.Event;
}

function makeRequest(): Request {
  return new Request('https://example.com/api/webhooks/stripe', {
    method: 'POST',
    body: 'raw_body',
  });
}

/** Litige gagne, client resolu sans appel reseau (payment_intent deja etendu). */
function disputeWonEvent(): Stripe.Event {
  return makeStripeEvent('charge.dispute.closed', {
    id: 'dp_1',
    status: 'won',
    payment_intent: { customer: 'cus_1' },
  });
}

describe('ACT-18 - charge.dispute.closed ne degele que ce que Stripe couvre', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Aucun paiement conteste pour ce client: donc aucun autre litige ouvert.
    mockChargesList.mockResolvedValue({ data: [] });
  });

  it('ne reactive PAS un essai expire gele par le cron (aucun abonnement Stripe)', async () => {
    // Gele par le cron des essais expires: pas de stripe_subscription_id.
    const chain = setupTenantsMock({
      tenant: {
        id: 'tenant-trial',
        subscription_status: 'frozen',
        stripe_subscription_id: null,
        // LOT 7: la cause doit etre le litige pour que le test exerce encore la
        // branche "aucun abonnement Stripe" qu'il a ete ecrit pour epingler.
        freeze_reason: 'dispute',
      },
    });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    // Le gel n'est pas du litige: aucune ecriture de statut ne doit partir.
    expect(chain.updatePayloads).toHaveLength(0);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it('ecrit le statut REEL de l abonnement, pas "active" en aveugle', async () => {
    // Gele par customer.subscription.deleted: l'abonnement est annule chez
    // Stripe. Un litige gagne ne doit pas le ressusciter en plan actif.
    const chain = setupTenantsMock({
      tenant: {
        id: 'tenant-cancelled',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_dead',
        freeze_reason: 'dispute',
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'canceled' });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_dead');
    // LOT 7: `cancelled` n'est pas un gel, la cause est donc effacee.
    expect(chain.updatePayloads).toEqual([
      { subscription_status: 'cancelled', is_active: false, freeze_reason: null },
    ]);
  });

  it('degele un abonnement reellement actif, et garde la garde "frozen" a l ecriture', async () => {
    const chain = setupTenantsMock({
      tenant: {
        id: 'tenant-ok',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_live',
        freeze_reason: 'dispute',
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    // RES-2c: un statut SAIN restaure efface la date d'entree en impaye, comme
    // le font checkout.session.completed et invoice.paid. Une date residuelle
    // sur un tenant sain est une incoherence qui n'attend que d'etre lue.
    expect(chain.updatePayloads).toEqual([
      {
        subscription_status: 'active',
        is_active: true,
        freeze_reason: null,
        past_due_since: null,
      },
    ]);
    // La garde optimiste reste: on n'ecrit que si la ligne est encore gelee.
    expect(chain.updateFilters).toEqual([
      ['id', 'tenant-ok'],
      ['subscription_status', 'frozen'],
    ]);
  });

  it('laisse le tenant gele si Stripe est injoignable (fail-closed)', async () => {
    const chain = setupTenantsMock({
      tenant: {
        id: 'tenant-flaky',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_flaky',
        freeze_reason: 'dispute',
      },
    });
    mockSubscriptionsRetrieve.mockRejectedValue(new Error('stripe 429'));
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    // Un litige ne doit pas mettre l'endpoint en echec (Stripe le desactiverait).
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(0);
  });

  // RES-1b: la LIMITE ASSUMEE du correctif ACT-18, jusqu'ici couverte par aucun
  // test. Un tenant gele par le cron pour impaye depasse qui gagne un litige
  // recupere son acces en 'past_due' tant que Stripe le dit encore 'past_due'.
  // C'est une decision produit (ne pas punir un client en relance qui vient de
  // gagner son litige), et elle n'est tenable que BORNEE: `past_due_since` doit
  // rester a sa valeur ancienne pour que le prochain passage du cron (quotidien)
  // regele le tenant. Ce test epingle les deux moities de cette promesse.
  it('rend l acces a un impaye que Stripe dit encore past_due, SANS repousser la borne', async () => {
    const chain = setupTenantsMock({
      tenant: {
        id: 'tenant-overdue',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_late',
        freeze_reason: 'dispute',
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'past_due' });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(1);
    const payload = chain.updatePayloads[0];
    expect(payload.subscription_status).toBe('past_due');
    expect(payload.is_active).toBe(true);
    // La borne: la date d'entree en impaye n'est PAS reecrite, donc le tenant
    // est toujours au-dela du seuil et le cron le regele au prochain passage.
    expect(payload).not.toHaveProperty('past_due_since');
  });

  it('ne touche pas un tenant qui n est plus gele', async () => {
    const chain = setupTenantsMock({
      tenant: {
        id: 'tenant-active',
        subscription_status: 'active',
        stripe_subscription_id: 'sub_live',
        freeze_reason: null,
      },
    });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(0);
  });
});

describe('ACT-19 - invoice.payment_failed ne re-entitle pas un tenant gele', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function paymentFailedEvent(): Stripe.Event {
    return makeStripeEvent('invoice.payment_failed', { customer: 'cus_1', id: 'in_1' });
  }

  it('ne sort PAS un tenant gele de son gel', async () => {
    const chain = setupTenantsMock({
      tenant: { id: 'tenant-frozen', subscription_status: 'frozen' },
    });
    mockConstructEvent.mockReturnValue(paymentFailedEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    // past_due est entitlant: l'ecrire ici rouvrirait l'acces a cause d'un IMPAYE.
    expect(chain.updatePayloads).toHaveLength(0);
  });

  it('ne ressuscite pas un abonnement resilie', async () => {
    const chain = setupTenantsMock({
      tenant: { id: 'tenant-cancelled', subscription_status: 'cancelled' },
    });
    mockConstructEvent.mockReturnValue(paymentFailedEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(0);
  });

  it('applique past_due depuis un statut sain, avec is_active et la date de borne', async () => {
    const chain = setupTenantsMock({
      tenant: { id: 'tenant-active', subscription_status: 'active' },
    });
    mockConstructEvent.mockReturnValue(paymentFailedEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(1);
    const payload = chain.updatePayloads[0];
    expect(payload.subscription_status).toBe('past_due');
    // Ce gestionnaire etait le seul a ne pas reecrire is_active: un statut
    // entitlant avec is_active=false rend la vitrine morte en silence.
    expect(payload.is_active).toBe(true);
    // Sans past_due_since, le cron de gel ne peut pas BORNER cet impaye: le
    // tenant garderait son plan indefiniment.
    expect(typeof payload.past_due_since).toBe('string');
  });

  it('reste idempotent sur un tenant deja past_due', async () => {
    const chain = setupTenantsMock({
      tenant: { id: 'tenant-pd', subscription_status: 'past_due' },
    });
    mockConstructEvent.mockReturnValue(paymentFailedEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// RES-1 - la MEME fuite, dans le gestionnaire voisin
// ---------------------------------------------------------------------------
// `customer.subscription.updated` ne portait aucune garde de statut: il ecrivait
// 'past_due' (entitlant) avec is_active=true sur un tenant GELE, et remettait
// `past_due_since` a maintenant. Boucle etablie par le contre-audit:
//   1. impaye -> past_due, past_due_since = J0
//   2. J0+16: le cron gele le tenant (past_due_since inchange). Acces coupe.
//   3. un evenement de relance Stripe arrive -> le tenant est DEGELE et le
//      compteur de 15 jours repart de zero.
//   4. retour en 2, indefiniment: plan payant gratuit a vie.
// Cela annulait aussi la borne "regel sous 24 h" revendiquee par ACT-18.
describe('RES-1 - customer.subscription.updated ne re-entitle pas un tenant gele', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function subscriptionUpdatedEvent(
    status: string,
    items: Record<string, unknown>[] = [],
  ): Stripe.Event {
    return makeStripeEvent('customer.subscription.updated', {
      customer: 'cus_1',
      status,
      items: { data: items },
    });
  }

  /** Tenant gele dont le plan et l'intervalle sont deja a jour. */
  function frozenTenant() {
    return {
      id: 'tenant-frozen',
      subscription_status: 'frozen',
      subscription_plan: 'pro',
      billing_interval: 'monthly',
    };
  }

  it('ne degele pas un tenant gele sur un evenement de relance (past_due)', async () => {
    const chain = setupTenantsMock({ tenant: frozenTenant() });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('past_due'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    // Ni re-entitlement, ni remise a zero du compteur de borne. CTR-2: la
    // seule ecriture est la re-affirmation de `is_active`, calculee sur le
    // statut COURANT - `frozen` - donc `false`. Elle ne rend aucun acces.
    expect(chain.updatePayloads).toEqual([{ is_active: false }]);
  });

  it('garde le plan et la periode a jour sans toucher au statut du tenant gele', async () => {
    const chain = setupTenantsMock({ tenant: frozenTenant() });
    mockConstructEvent.mockReturnValue(
      subscriptionUpdatedEvent('past_due', [
        { current_period_start: 1700000000, current_period_end: 1702592000 },
      ]),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(1);
    const payload = chain.updatePayloads[0];
    expect(payload.subscription_current_period_start).toBe(
      new Date(1700000000 * 1000).toISOString(),
    );
    expect(payload.subscription_current_period_end).toBe(new Date(1702592000 * 1000).toISOString());
    // Le statut entrant et la borne d'impaye restent intouches.
    expect(payload).not.toHaveProperty('subscription_status');
    expect(payload).not.toHaveProperty('past_due_since');
    // CTR-2: `is_active` est re-affirme, mais depuis le statut COURANT. Sur ce
    // tenant gele cela vaut `false`: la vitrine reste eteinte, le plan et la
    // periode sont a jour. C'est la correction d'une regression, pas un
    // relachement: l'ancien code ecrivait toujours is_active, la garde du lot
    // precedent l'avait supprime, et un tenant `past_due` + `is_active=false`
    // n'avait plus de chemin de reparation hors paiement.
    expect(payload.is_active).toBe(false);
  });

  it('degele un tenant dont l abonnement redevient REELLEMENT actif', async () => {
    const chain = setupTenantsMock({ tenant: frozenTenant() });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('active'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(1);
    const payload = chain.updatePayloads[0];
    // 'active' prouve que Stripe est paye: la reprise d'acces est legitime.
    expect(payload.subscription_status).toBe('active');
    expect(payload.is_active).toBe(true);
    expect(payload.past_due_since).toBeNull();
  });

  it('applique toujours une resiliation a un tenant gele', async () => {
    const chain = setupTenantsMock({ tenant: frozenTenant() });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('canceled'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    // Un statut NON entitlant est toujours ecrit: la garde ne protege que
    // contre une reprise d'acces, jamais contre une degradation.
    expect(chain.updatePayloads).toHaveLength(1);
    expect(chain.updatePayloads[0].subscription_status).toBe('cancelled');
    expect(chain.updatePayloads[0].is_active).toBe(false);
  });

  it('horodate la PREMIERE entree en impaye depuis un statut sain', async () => {
    const chain = setupTenantsMock({
      tenant: {
        id: 'tenant-active',
        subscription_status: 'active',
        subscription_plan: 'pro',
        billing_interval: 'monthly',
      },
    });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('past_due'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(1);
    const payload = chain.updatePayloads[0];
    expect(payload.subscription_status).toBe('past_due');
    expect(payload.is_active).toBe(true);
    expect(typeof payload.past_due_since).toBe('string');
  });

  it('ne remet pas le compteur a zero sur un tenant deja past_due', async () => {
    const chain = setupTenantsMock({
      tenant: {
        id: 'tenant-pd',
        subscription_status: 'past_due',
        subscription_plan: 'pro',
        billing_interval: 'monthly',
      },
    });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('past_due'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    // 'past_due' ne s'ecrit que depuis un statut SAIN: ici il est deja pose,
    // donc le statut n'est pas reecrit - et surtout aucun past_due_since neuf.
    //
    // CTR-2: la seule chose qui part est la re-affirmation de `is_active`,
    // calculee sur le statut COURANT. Avant LOT 7 ce payload etait vide et un
    // tenant reste a `past_due` + `is_active=false` - etat que le code pre-LOT3
    // a pu creer en base - n'avait plus aucun chemin de reparation.
    expect(chain.updatePayloads).toEqual([{ is_active: true }]);
  });

  // CTR-2, l'autre moitie: la re-affirmation se calcule sur le statut COURANT,
  // jamais sur le statut entrant. Sur un tenant gele elle ecrit donc `false`,
  // et ne peut jamais rendre d'acces.
  it('ne rend aucun acces en re-affirmant is_active sur un tenant gele', async () => {
    const chain = setupTenantsMock({
      tenant: {
        id: 'tenant-frozen',
        subscription_status: 'frozen',
        subscription_plan: 'pro',
        billing_interval: 'monthly',
      },
    });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('past_due'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toEqual([{ is_active: false }]);
  });
});
