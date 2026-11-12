import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

/**
 * LOT 7 - la CAUSE du gel, et la garde manquante de checkout.session.completed.
 *
 * CTR-1 - `checkout.session.completed` ecrivait le bloc d'acces
 * (`subscription_status` + `is_active` + `past_due_since: null`) sans aucune
 * garde, depuis n'importe quel statut de depart. Comme `mapStripeStatus`
 * traduit le `incomplete` de Stripe en `past_due` - un statut ENTITLANT - un
 * tenant gele pouvait se degeler tout seul en ouvrant une session de paiement
 * qu'il n'achevait pas, et son compte a rebours de 15 jours etait EFFACE
 * (`past_due_since = NULL` sort du filtre du cron). Meme gestionnaire, variante
 * fail-OPEN: si `subscriptions.retrieve` levait, le defaut `'active'` partait en
 * base sans qu'aucun etat n'ait ete lu chez Stripe.
 *
 * CAUSE DU GEL - `frozen` est l'etat de gel GENERIQUE du projet: litige,
 * abonnement supprime, essai expire, impaye depasse, statut Stripe impaye. Sans
 * cause enregistree, un litige gagne levait n'importe lequel de ces gels. La
 * colonne `freeze_reason` la porte, et `charge.dispute.closed` ne leve plus que
 * le gel qu'il a lui-meme pose.
 *
 * INVARIANT teste ici: `freeze_reason` est non nul SI ET SEULEMENT SI le statut
 * ecrit est `frozen`. C'est ce qui rend le dispositif robuste a un chemin de gel
 * futur qui oublierait la cause: la cause est effacee a chaque sortie de gel,
 * donc un oubli laisse NULL, et NULL ne leve aucun gel (fail-closed).
 */

const { mockConstructEvent, mockSubscriptionsRetrieve, mockChargesList, mockDisputesList } =
  vi.hoisted(() => ({
    mockConstructEvent: vi.fn(),
    mockSubscriptionsRetrieve: vi.fn(),
    mockChargesList: vi.fn(),
    mockDisputesList: vi.fn(),
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
    disputes: { list: mockDisputesList },
  }),
  STRIPE_PRICES: {},
  getPlanFromPriceId: vi.fn().mockReturnValue(null),
  getIntervalFromPriceId: vi.fn().mockReturnValue(null),
}));

import { POST } from '../stripe/route';

// ---------------------------------------------------------------------------
// Double Supabase
// ---------------------------------------------------------------------------

type QueryResult = { data: unknown; error: unknown };

interface Chain extends PromiseLike<QueryResult> {
  eq: (column: string, value: unknown) => Chain;
  // LOT 9 / CTR7-1: `invoice.paid` scope desormais son ecriture sur les tenants
  // ni suspendus ni supprimes (`.is('suspended_at', null)`). Le double doit
  // porter le meme maillon que le builder postgrest, sinon il ne represente
  // plus la requete reellement envoyee.
  is: (column: string, value: unknown) => Chain;
  maybeSingle: () => Promise<QueryResult>;
  single: () => Promise<QueryResult>;
}

interface MockOptions {
  /** Ligne tenant renvoyee par les select (null = introuvable). */
  tenant?: Record<string, unknown> | null;
  /**
   * La colonne freeze_reason n'existe pas encore en base: tout select qui la
   * demande repond 42703, comme le ferait Postgres avant la migration.
   */
  freezeReasonColumnMissing?: boolean;
  /** Erreurs renvoyees par les update successifs (defaut: aucune). */
  updateErrors?: unknown[];
}

function setupMock(options: MockOptions = {}) {
  const updatePayloads: Record<string, unknown>[] = [];
  const updateFilters: [string, unknown][] = [];
  const selectedColumns: string[] = [];
  const updateErrors = [...(options.updateErrors ?? [])];

  const tenantRow = options.tenant === undefined ? { id: 'tenant-1' } : options.tenant;

  function makeChain(result: () => QueryResult, onEq?: (c: string, v: unknown) => void): Chain {
    const chain: Chain = {
      eq: (column, value) => {
        onEq?.(column, value);
        return chain;
      },
      is: (column, value) => {
        onEq?.(column, value);
        return chain;
      },
      maybeSingle: () => Promise.resolve(result()),
      single: () => Promise.resolve(result()),
      then: (onFulfilled, onRejected) => Promise.resolve(result()).then(onFulfilled, onRejected),
    };
    return chain;
  }

  mockFrom.mockImplementation((table: string) => {
    if (table === 'stripe_events') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'evt_test' }, error: null }),
          }),
        }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
    }

    if (table === 'tenants') {
      return {
        select: vi.fn((columns: string) => {
          selectedColumns.push(columns);
          const missing =
            options.freezeReasonColumnMissing === true && columns.includes('freeze_reason');
          return makeChain(() =>
            missing
              ? {
                  data: null,
                  error: {
                    code: '42703',
                    message: 'column tenants.freeze_reason does not exist',
                  },
                }
              : { data: tenantRow, error: tenantRow ? null : { message: 'not found' } },
          );
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayloads.push(payload);
          const error = updateErrors.length > 0 ? updateErrors.shift() : null;
          return makeChain(
            () => ({ data: null, error: error ?? null }),
            (column, value) => updateFilters.push([column, value]),
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

function checkoutEvent(): Stripe.Event {
  return makeStripeEvent('checkout.session.completed', {
    metadata: { tenant_id: 'tenant-1', plan: 'pro', billing_interval: 'monthly' },
    customer: 'cus_1',
    subscription: 'sub_new',
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

beforeEach(() => {
  vi.clearAllMocks();
  // Par defaut: aucun paiement conteste pour ce client, donc aucun autre litige.
  mockChargesList.mockResolvedValue({ data: [] });
  mockDisputesList.mockResolvedValue({ data: [] });
});

// ---------------------------------------------------------------------------
// CTR-1 - checkout.session.completed
// ---------------------------------------------------------------------------

describe('CTR-1 - checkout.session.completed applique la regle du fichier', () => {
  it('ne degele PAS un tenant gele quand Stripe dit "incomplete" (statut entitlant sans paiement)', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        stripe_subscription_id: 'sub_old',
        subscription_status: 'frozen',
      },
    });
    // Paiement initial non confirme (3-D Secure abandonne, moyen asynchrone).
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'incomplete' });
    mockConstructEvent.mockReturnValue(checkoutEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(1);
    const payload = chain.updatePayloads[0];
    // Les identifiants Stripe sont enregistres: ils ne rendent aucun acces.
    expect(payload.stripe_subscription_id).toBe('sub_new');
    // Le bloc d'acces, lui, ne part pas.
    expect(payload).not.toHaveProperty('subscription_status');
    expect(payload).not.toHaveProperty('is_active');
    // Et surtout: le compte a rebours de 15 jours n'est PAS efface. Un NULL
    // sortirait le tenant du filtre du cron, donc du gel, pour toujours.
    expect(payload).not.toHaveProperty('past_due_since');
  });

  // LOT 9 / CTR7-3: l'attente est RENFORCEE, pas relachee. Ce test verifiait
  // "200, et le bloc d'acces ne part pas" - ce qui blessait un fail-closed
  // TERMINAL: Stripe ne rejouait jamais l'evenement du PREMIER paiement, et
  // `stripe_subscription_id` ecrit faisait court-circuiter la garde
  // d'idempotence a toute retentative. Il verifie maintenant qu'ABSOLUMENT
  // rien n'est ecrit et que l'evenement redevient rejouable (500 + ligne
  // d'idempotence retiree). Les trois `not.toHaveProperty` sont donc remplacees
  // par une assertion strictement plus forte: zero ecriture.
  it('est fail-closed ET rejouable quand l abonnement est illisible chez Stripe', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        stripe_subscription_id: 'sub_old',
        subscription_status: 'frozen',
      },
    });
    mockSubscriptionsRetrieve.mockRejectedValue(new Error('stripe 429'));
    mockConstructEvent.mockReturnValue(checkoutEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(500);

    // L'ancien defaut 'active' partait en base sans qu'aucun etat n'ait ete lu;
    // le correctif precedent n'ecrivait plus l'acces mais perdait l'evenement.
    expect(chain.updatePayloads).toHaveLength(0);
  });

  it('est fail-closed quand la session ne porte aucun abonnement', async () => {
    const chain = setupMock({
      // `stripe_subscription_id` non nul: sinon la garde d'idempotence du
      // gestionnaire court-circuite (null === null) et le test ne prouve rien.
      tenant: { id: 'tenant-1', stripe_subscription_id: 'sub_old', subscription_status: 'frozen' },
    });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent('checkout.session.completed', {
        metadata: { tenant_id: 'tenant-1' },
        customer: 'cus_1',
        subscription: null,
      }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(1);
    expect(chain.updatePayloads[0]).not.toHaveProperty('subscription_status');
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
  });

  // Le cas legitime et le plus courant. CARACTERISATION ASSUMEE: ce test passe
  // avant comme apres le correctif - il est la pour prouver que la garde ne
  // casse pas le chemin qui fait rentrer l'argent.
  it('rend bien l acces a un tenant en essai qui paie pour la premiere fois', async () => {
    const chain = setupMock({
      tenant: { id: 'tenant-1', stripe_subscription_id: null, subscription_status: 'trial' },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockConstructEvent.mockReturnValue(checkoutEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(1);
    const payload = chain.updatePayloads[0];
    expect(payload.subscription_status).toBe('active');
    expect(payload.is_active).toBe(true);
    expect(payload.past_due_since).toBeNull();
    expect(payload.freeze_reason).toBeNull();
    expect(payload.subscription_plan).toBe('pro');
  });

  // Un tenant gele qui repaie VRAIMENT doit retrouver sa vitrine: la garde ne
  // bloque que les statuts entitlants SANS preuve de paiement.
  it('degele un tenant gele dont Stripe confirme l abonnement actif', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        stripe_subscription_id: 'sub_old',
        subscription_status: 'frozen',
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockConstructEvent.mockReturnValue(checkoutEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    const payload = chain.updatePayloads[0];
    expect(payload.subscription_status).toBe('active');
    expect(payload.is_active).toBe(true);
    expect(payload.past_due_since).toBeNull();
    expect(payload.freeze_reason).toBeNull();
  });

  it('ecrit la cause du gel quand Stripe dit "unpaid", sans effacer la borne d impaye', async () => {
    const chain = setupMock({
      tenant: { id: 'tenant-1', stripe_subscription_id: 'sub_old', subscription_status: 'active' },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'unpaid' });
    mockConstructEvent.mockReturnValue(checkoutEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    const payload = chain.updatePayloads[0];
    expect(payload.subscription_status).toBe('frozen');
    expect(payload.is_active).toBe(false);
    expect(payload.freeze_reason).toBe('stripe_unpaid');
    // Un gel n'efface pas la date d'entree en impaye.
    expect(payload).not.toHaveProperty('past_due_since');
  });
});

// ---------------------------------------------------------------------------
// La cause du gel, un test par chemin d'ecriture de statut
// ---------------------------------------------------------------------------

describe('cause du gel - chaque chemin l ecrit (invariant: non nul SSI frozen)', () => {
  it('customer.subscription.deleted -> subscription_deleted', async () => {
    const chain = setupMock({ tenant: { id: 'tenant-1', subscription_status: 'active' } });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent('customer.subscription.deleted', { customer: 'cus_1', status: 'canceled' }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toEqual([
      {
        subscription_status: 'frozen',
        is_active: false,
        freeze_reason: 'subscription_deleted',
        stripe_subscription_id: null,
      },
    ]);
  });

  it('charge.dispute.created -> dispute', async () => {
    const chain = setupMock({ tenant: { id: 'tenant-1', subscription_status: 'active' } });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent('charge.dispute.created', {
        id: 'dp_1',
        payment_intent: { customer: 'cus_1' },
      }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toEqual([
      { subscription_status: 'frozen', is_active: false, freeze_reason: 'dispute' },
    ]);
  });

  it('customer.subscription.updated avec "unpaid" -> stripe_unpaid', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'active',
        subscription_plan: 'pro',
        billing_interval: 'monthly',
      },
    });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent('customer.subscription.updated', {
        customer: 'cus_1',
        status: 'unpaid',
        items: { data: [] },
      }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(1);
    expect(chain.updatePayloads[0].subscription_status).toBe('frozen');
    expect(chain.updatePayloads[0].freeze_reason).toBe('stripe_unpaid');
  });

  it('customer.subscription.updated avec un statut sain efface la cause', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        subscription_plan: 'pro',
        billing_interval: 'monthly',
      },
    });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent('customer.subscription.updated', {
        customer: 'cus_1',
        status: 'active',
        items: { data: [] },
      }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    // C'est cet effacement qui rend le dispositif robuste: un chemin de gel
    // futur qui oublierait la cause trouvera NULL, pas une cause heritee.
    expect(chain.updatePayloads[0].freeze_reason).toBeNull();
  });

  it('invoice.payment_failed efface la cause (past_due n est pas un gel)', async () => {
    const chain = setupMock({ tenant: { id: 'tenant-1', subscription_status: 'active' } });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent('invoice.payment_failed', { customer: 'cus_1', id: 'in_1' }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads[0].subscription_status).toBe('past_due');
    expect(chain.updatePayloads[0].freeze_reason).toBeNull();
  });

  it('invoice.paid efface la cause', async () => {
    const chain = setupMock({ tenant: { id: 'tenant-1', subscription_status: 'past_due' } });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent('invoice.paid', { customer: 'cus_1', id: 'in_2' }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads[0].subscription_status).toBe('active');
    expect(chain.updatePayloads[0].freeze_reason).toBeNull();
  });

  it('charge.dispute.closed qui restaure "unpaid" regele avec la bonne cause', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_1',
        freeze_reason: 'dispute',
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'unpaid' });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(1);
    expect(chain.updatePayloads[0].subscription_status).toBe('frozen');
    expect(chain.updatePayloads[0].freeze_reason).toBe('stripe_unpaid');
  });
});

// ---------------------------------------------------------------------------
// Un litige gagne ne leve QUE le gel qu'il a pose
// ---------------------------------------------------------------------------

describe('charge.dispute.closed - un litige gagne ne leve que le gel du litige', () => {
  it('ne rouvre PAS un essai expire gele par le cron, meme si Stripe dit "active"', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_1',
        freeze_reason: 'trial_expired',
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(0);
    // La cause suffit a trancher: aucun appel reseau de plus.
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it('ne rouvre PAS un abonnement annule gele par customer.subscription.deleted', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_1',
        freeze_reason: 'subscription_deleted',
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(0);
  });

  it('ne rouvre PAS un impaye depasse gele par le cron', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_1',
        freeze_reason: 'past_due_overdue',
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(0);
  });

  it('leve le gel quand la cause EST le litige et que Stripe confirme l abonnement', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_1',
        freeze_reason: 'dispute',
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toEqual([
      {
        subscription_status: 'active',
        is_active: true,
        freeze_reason: null,
        past_due_since: null,
      },
    ]);
  });

  it('reste gele si un AUTRE litige est encore ouvert chez Stripe', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_1',
        freeze_reason: 'dispute',
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockChargesList.mockResolvedValue({ data: [{ id: 'ch_1', disputed: true }] });
    mockDisputesList.mockResolvedValue({ data: [{ id: 'dp_2', status: 'needs_response' }] });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(0);
  });

  it('reste gele si l etat des litiges du client est illisible (fail-closed)', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_1',
        freeze_reason: 'dispute',
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockChargesList.mockRejectedValue(new Error('stripe 500'));
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(0);
  });

  it('ignore le litige qu on est justement en train de fermer', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_1',
        freeze_reason: 'dispute',
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    // Stripe renvoie encore le litige courant: il ne doit pas se bloquer
    // lui-meme.
    mockChargesList.mockResolvedValue({ data: [{ id: 'ch_1', disputed: true }] });
    mockDisputesList.mockResolvedValue({ data: [{ id: 'dp_1', status: 'won' }] });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Le code part en production AVANT la migration
// ---------------------------------------------------------------------------

describe('colonne freeze_reason absente - comportement sur, jamais de 500', () => {
  it('ne leve AUCUN gel quand la cause est illisible', async () => {
    const chain = setupMock({
      freezeReasonColumnMissing: true,
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_1',
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    // Pas de 500: un endpoint durablement en erreur finit DESACTIVE par Stripe.
    expect(response.status).toBe(200);
    // Colonne absente = cause inconnue = on ne leve pas le gel.
    expect(chain.updatePayloads).toHaveLength(0);
    // La lecture a bien ete rejouee sans la colonne.
    expect(chain.selectedColumns.some((c) => c.includes('freeze_reason'))).toBe(true);
    expect(chain.selectedColumns.some((c) => !c.includes('freeze_reason'))).toBe(true);
  });

  it('rejoue l ecriture sans la cause plutot que de renvoyer 500', async () => {
    const chain = setupMock({
      tenant: { id: 'tenant-1', subscription_status: 'active' },
      updateErrors: [{ code: '42703', message: 'column tenants.freeze_reason does not exist' }],
    });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent('customer.subscription.deleted', { customer: 'cus_1', status: 'canceled' }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(2);
    expect(chain.updatePayloads[0].freeze_reason).toBe('subscription_deleted');
    // Le gel lui-meme passe quand meme: c'est la direction sure.
    expect(chain.updatePayloads[1]).toEqual({
      subscription_status: 'frozen',
      is_active: false,
      stripe_subscription_id: null,
    });
  });
});
