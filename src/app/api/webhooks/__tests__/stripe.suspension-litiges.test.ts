import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

/**
 * LOT 9 - la suspension plateforme, la cause du gel ECRASEE, et le premier
 * paiement perdu.
 *
 * CTR7-1 - une suspension decidee par le super-admin ne s'exprime en base que
 * par `is_active = false` (plus `suspended_at`, qui etait affiche mais applique
 * NULLE PART). Or cinq gestionnaires du webhook reecrivent `is_active`, et le
 * calculent sur le seul statut d'abonnement: un tenant coupe par la plateforme
 * mais dont Stripe dit encore `past_due` ou `active` etait donc RALLUME par le
 * premier evenement de relance - vitrine, prise de commande et tableau de bord
 * rouverts, pendant que la console plateforme continuait d'afficher "suspendu".
 *
 * CTR7-2 - la cause du gel n'etait pas protegee contre l'ECRASEMENT par une
 * autre cause. `charge.dispute.created` ecrivait `dispute` par-dessus un gel
 * pour impaye depasse (que `charge.dispute.closed` devenait alors autorise a
 * lever), et la branche `else` de `customer.subscription.updated` ecrasait
 * `dispute` par `stripe_unpaid` (donc un litige gagne ne degelait plus un client
 * qui paie).
 *
 * CTR7-3 - le fail-closed de `checkout.session.completed` etait TERMINAL: le
 * `catch` avalait l'echec, la route repondait 200, Stripe ne rejouait donc
 * jamais l'evenement du PREMIER paiement, et comme `stripe_subscription_id`
 * avait ete ecrit la garde d'idempotence bloquait toute retentative.
 *
 * CTR7-4 - `OPEN_DISPUTE_STATUSES` ignorait `warning_needs_response` et
 * `warning_under_review`, et un litige PERDU ne bloquait rien. Le controle des
 * litiges n'etait applique que par `charge.dispute.closed`, pas par les deux
 * autres gestionnaires qui peuvent rendre l'acces.
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
// Double Supabase - chainable `.eq()` ET `.is()`, comme un builder postgrest
// ---------------------------------------------------------------------------

type QueryResult = { data: unknown; error: unknown };

interface Chain extends PromiseLike<QueryResult> {
  eq: (column: string, value: unknown) => Chain;
  is: (column: string, value: unknown) => Chain;
  maybeSingle: () => Promise<QueryResult>;
  single: () => Promise<QueryResult>;
}

interface MockOptions {
  /** Ligne tenant renvoyee par les select (null = introuvable). */
  tenant?: Record<string, unknown> | null;
  /** Erreur renvoyee par TOUT select (simule une ligne illisible). */
  selectError?: unknown;
  /** Erreurs renvoyees par les update successifs (defaut: aucune). */
  updateErrors?: unknown[];
  /** La colonne freeze_reason n'existe pas encore: tout select qui la demande echoue. */
  freezeReasonColumnMissing?: boolean;
  /** Code d'erreur utilise pour simuler la colonne absente (42703 par defaut). */
  missingColumnCode?: string;
}

function setupMock(options: MockOptions = {}) {
  const updatePayloads: Record<string, unknown>[] = [];
  const updateFilters: [string, unknown][] = [];
  const selectedColumns: string[] = [];
  const deletedEventIds: unknown[] = [];
  const updateErrors = [...(options.updateErrors ?? [])];
  const missingCode = options.missingColumnCode ?? '42703';

  const tenantRow = options.tenant === undefined ? { id: 'tenant-1' } : options.tenant;

  function makeChain(result: () => QueryResult, onFilter?: (c: string, v: unknown) => void): Chain {
    const chain: Chain = {
      eq: (column, value) => {
        onFilter?.(column, value);
        return chain;
      },
      is: (column, value) => {
        onFilter?.(column, value);
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
        delete: vi.fn().mockReturnValue({
          eq: vi.fn((_column: string, value: unknown) => {
            deletedEventIds.push(value);
            return Promise.resolve({ error: null });
          }),
        }),
      };
    }

    if (table === 'tenants') {
      return {
        select: vi.fn((columns: string) => {
          selectedColumns.push(columns);
          const missing =
            options.freezeReasonColumnMissing === true && columns.includes('freeze_reason');
          return makeChain(() => {
            if (missing) {
              return {
                data: null,
                error: { code: missingCode, message: 'column tenants.freeze_reason' },
              };
            }
            if (options.selectError) return { data: null, error: options.selectError };
            return { data: tenantRow, error: tenantRow ? null : { message: 'not found' } };
          });
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

  return { updatePayloads, updateFilters, selectedColumns, deletedEventIds };
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

// Un vrai evenement porte toujours l'identifiant de l'abonnement. Il est celui
// des restaurants de ce fichier: un evenement d'un AUTRE abonnement est ignore
// (intrusion M-02, couvert dans stripe.test.ts).
function subscriptionUpdatedEvent(status: string, subscriptionId = 'sub_old'): Stripe.Event {
  return makeStripeEvent('customer.subscription.updated', {
    id: subscriptionId,
    customer: 'cus_1',
    status,
    items: { data: [] },
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
  // Par defaut: aucun paiement conteste pour ce client, donc aucun litige.
  mockChargesList.mockResolvedValue({ data: [] });
  mockDisputesList.mockResolvedValue({ data: [] });
});

// ---------------------------------------------------------------------------
// CTR7-1 - aucun evenement Stripe ne leve une suspension plateforme
// ---------------------------------------------------------------------------

describe('CTR7-1 - le webhook ne leve jamais une suspension plateforme', () => {
  /** Tenant coupe par le super-admin: is_active=false ET suspended_at pose. */
  function suspendedTenant(status: string): Record<string, unknown> {
    return {
      id: 'tenant-1',
      subscription_status: status,
      subscription_plan: 'pro',
      billing_interval: 'monthly',
      stripe_subscription_id: 'sub_old',
      suspended_at: '2026-11-01T10:00:00.000Z',
      deleted_at: null,
    };
  }

  it('subscription.updated past_due -> past_due ne rallume pas un tenant suspendu', async () => {
    const chain = setupMock({ tenant: suspendedTenant('past_due') });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('past_due'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    // C'est la transition la plus frequente qui soit (chaque relance Stripe).
    // La re-affirmation de `is_active` se calcule sur le statut courant, donc
    // elle valait `true` et DESUSPENDAIT le tenant.
    expect(chain.updatePayloads).toEqual([{ is_active: false }]);
  });

  it('subscription.updated active ne rallume pas un tenant suspendu', async () => {
    const chain = setupMock({ tenant: suspendedTenant('past_due') });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('active'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    // Le statut REEL est ecrit (la base ne doit pas mentir sur l'abonnement),
    // mais l'acces, lui, reste coupe: la suspension est une decision humaine.
    expect(chain.updatePayloads).toHaveLength(1);
    expect(chain.updatePayloads[0].subscription_status).toBe('active');
    expect(chain.updatePayloads[0].is_active).toBe(false);
  });

  it('checkout.session.completed ne rallume pas un tenant suspendu qui paie', async () => {
    const chain = setupMock({ tenant: suspendedTenant('past_due') });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockConstructEvent.mockReturnValue(checkoutEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(1);
    expect(chain.updatePayloads[0].subscription_status).toBe('active');
    expect(chain.updatePayloads[0].is_active).toBe(false);
  });

  it('invoice.payment_failed ne rallume pas un tenant suspendu', async () => {
    // Un impaye sur un tenant suspendu dont Stripe disait encore 'active':
    // `is_active: isActiveForStatus('past_due')` valait true, donc l'ECHEC de
    // paiement rendait l'acces. Gestionnaire absent de la liste du contre-audit.
    const chain = setupMock({ tenant: suspendedTenant('active') });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent('invoice.payment_failed', { customer: 'cus_1', id: 'in_1' }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(1);
    expect(chain.updatePayloads[0].subscription_status).toBe('past_due');
    expect(chain.updatePayloads[0].is_active).toBe(false);
  });

  it('invoice.paid scope son ecriture sur les tenants ni suspendus ni supprimes', async () => {
    // Ce gestionnaire n'a aucune lecture prealable (filet idempotent, scope
    // `past_due`): la garde ne peut etre qu'un filtre d'ecriture. Son payload
    // est exclusivement un bloc d'acces, donc rien n'est perdu a le filtrer.
    const chain = setupMock({ tenant: { id: 'tenant-1', subscription_status: 'past_due' } });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent('invoice.paid', { customer: 'cus_1', id: 'in_2', amount_paid: 29000 }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    // Les DEUX ecritures portent les verrous humains: la levee d'impaye, et la
    // levee du gel pour remboursement ajoutee ensuite. Une facture payee ne
    // leve jamais une suspension plateforme, quelle que soit la cause visee.
    expect(chain.updateFilters).toEqual([
      ['stripe_customer_id', 'cus_1'],
      ['subscription_status', 'past_due'],
      ['suspended_at', null],
      ['deleted_at', null],
      ['stripe_customer_id', 'cus_1'],
      ['subscription_status', 'frozen'],
      ['freeze_reason', 'refund'],
      ['suspended_at', null],
      ['deleted_at', null],
    ]);
  });

  /**
   * Un remboursement ne change PAS le statut de l'abonnement chez Stripe: il
   * reste `active`, et `active` est un statut sain. Sans garde, ce seul
   * evenement - que Stripe envoie a chaque roulement de periode - rendait
   * l'acces a un client integralement rembourse, sans qu'un franc soit rentre.
   * Trouve par la revue de securite sur la premiere version du correctif.
   */
  it('customer.subscription.updated ne leve pas un gel pour remboursement', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        freeze_reason: 'refund',
      },
    });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('active'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    // Le statut n'est PAS reecrit, et l'acces n'est pas rallume.
    for (const payload of chain.updatePayloads) {
      expect(payload.subscription_status).toBeUndefined();
      expect(payload.is_active).not.toBe(true);
      expect(payload.freeze_reason).toBeUndefined();
    }
  });

  /** Et il leve toujours les gels dont la cause l'autorise. */
  it('customer.subscription.updated leve bien un gel pour impaye', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        freeze_reason: 'stripe_unpaid',
      },
    });
    mockDisputesList.mockResolvedValue({ data: [] });
    mockChargesList.mockResolvedValue({ data: [] });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('active'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    const rallumage = chain.updatePayloads.some(
      (p) => p.subscription_status === 'active' && p.is_active === true,
    );
    expect(rallumage).toBe(true);
  });

  it('charge.dispute.closed gagne ne rallume pas un tenant suspendu', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_1',
        freeze_reason: 'dispute',
        suspended_at: '2026-11-01T10:00:00.000Z',
        deleted_at: null,
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(1);
    expect(chain.updatePayloads[0].is_active).toBe(false);
    // L'acces ne serait pas rendu: inutile d'aller relire les litiges.
    expect(mockChargesList).not.toHaveBeenCalled();
  });

  it('un tenant supprime (soft delete) n est pas rallume non plus', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'past_due',
        subscription_plan: 'pro',
        billing_interval: 'monthly',
        suspended_at: null,
        deleted_at: '2026-10-01T10:00:00.000Z',
      },
    });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('active'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads[0].is_active).toBe(false);
  });

  it('un tenant NI suspendu NI supprime retrouve bien son acces en payant', async () => {
    // Garde-fou: la protection ci-dessus ne doit pas casser le chemin qui fait
    // rentrer l'argent.
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        subscription_plan: 'pro',
        billing_interval: 'monthly',
        suspended_at: null,
        deleted_at: null,
      },
    });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('active'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads[0].subscription_status).toBe('active');
    expect(chain.updatePayloads[0].is_active).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CTR7-2 - la cause du gel ne s'ecrase pas
// ---------------------------------------------------------------------------

describe('CTR7-2 - une cause de gel deja posee n est jamais ecrasee', () => {
  it('charge.dispute.created preserve un gel pour impaye depasse', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        freeze_reason: 'past_due_overdue',
      },
    });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent('charge.dispute.created', {
        id: 'dp_1',
        payment_intent: { customer: 'cus_1' },
      }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    // Le tenant est DEJA gele: il n'y a rien a geler de plus, et surtout rien a
    // reecrire. Ecrire 'dispute' ici rendait le gel du cron liftable par
    // charge.dispute.closed.
    expect(chain.updatePayloads).toEqual([{ is_active: false }]);
    expect(chain.updateFilters).toEqual([['id', 'tenant-1']]);
  });

  it('charge.dispute.created gele bien un tenant actif, avec sa cause', async () => {
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

  it('charge.dispute.created gele quand meme si la ligne est illisible, sans cause', async () => {
    // Deux tenants partageant un client Stripe, ou un echec transitoire: le gel
    // ne doit JAMAIS etre saute (l'argent est en jeu), mais on ne peut pas
    // affirmer une cause qu'on n'a pas lue.
    const chain = setupMock({ selectError: { message: 'multiple rows returned' } });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent('charge.dispute.created', {
        id: 'dp_1',
        payment_intent: { customer: 'cus_1' },
      }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toEqual([{ subscription_status: 'frozen', is_active: false }]);
    expect(chain.updateFilters).toEqual([['stripe_customer_id', 'cus_1']]);
  });

  it('subscription.updated unpaid preserve la cause dispute d un tenant gele', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        subscription_plan: 'pro',
        billing_interval: 'monthly',
        freeze_reason: 'dispute',
      },
    });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('unpaid'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    // Ecraser 'dispute' par 'stripe_unpaid' tuait le degel automatique: le
    // client gagnait son litige et restait gele.
    expect(chain.updatePayloads[0].subscription_status).toBe('frozen');
    expect(chain.updatePayloads[0].freeze_reason).toBe('dispute');
  });

  it('checkout.session.completed preserve la cause dispute d un tenant gele', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        stripe_subscription_id: 'sub_old',
        subscription_status: 'frozen',
        freeze_reason: 'dispute',
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'unpaid' });
    mockConstructEvent.mockReturnValue(checkoutEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads[0].subscription_status).toBe('frozen');
    expect(chain.updatePayloads[0].freeze_reason).toBe('dispute');
  });

  it('subscription.updated unpaid ecrit stripe_unpaid depuis un tenant non gele', async () => {
    // L'invariant ne change pas quand il n'y a aucune cause a preserver.
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'active',
        subscription_plan: 'pro',
        billing_interval: 'monthly',
        freeze_reason: null,
      },
    });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('unpaid'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads[0].freeze_reason).toBe('stripe_unpaid');
  });
});

// ---------------------------------------------------------------------------
// CTR7-3 - le premier paiement doit rester REJOUABLE
// ---------------------------------------------------------------------------

describe('CTR7-3 - checkout.session.completed rejouable quand Stripe est illisible', () => {
  it('renvoie 500 et n ecrit RIEN quand subscriptions.retrieve echoue', async () => {
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

    // 200 rendait l'echec TERMINAL: Stripe ne rejouait jamais l'evenement du
    // premier paiement, et stripe_subscription_id ecrit faisait court-circuiter
    // la garde d'idempotence a toute retentative.
    expect(response.status).toBe(500);
    expect(chain.updatePayloads).toHaveLength(0);
    // La ligne d'idempotence est retiree: sans quoi le rejeu de Stripe serait
    // court-circuite comme "deja traite".
    expect(chain.deletedEventIds).toEqual(['evt_test']);
  });

  it('consomme l evenement quand le tenant est INTROUVABLE (PGRST116), sans boucle de rejeu', async () => {
    // R10-2. `.single()` sur zero ligne rend PGRST116: le tenant a ete supprime
    // ou l identifiant de la session est faux. C est PERMANENT, donc un 500
    // ferait rejouer Stripe trois jours pour un evenement qui ne reussira
    // jamais - et un endpoint durablement en erreur finit DESACTIVE, ce qui
    // ferait perdre les evenements de TOUS les autres clients. Distinct du cas
    // "illisible" juste au-dessus, qui lui est transitoire et doit rejouer.
    const chain = setupMock({
      tenant: null,
      selectError: { code: 'PGRST116', message: 'JSON object requested, 0 rows' },
    });
    mockConstructEvent.mockReturnValue(checkoutEvent());

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(0);
    // La ligne d idempotence RESTE: l evenement est consomme, pas rejouable.
    expect(chain.deletedEventIds).toEqual([]);
  });

  it('reste en 200 quand la session ne porte simplement aucun abonnement', async () => {
    // Condition PERMANENTE: un 500 ferait rejouer Stripe pendant trois jours
    // pour rien, et un endpoint durablement en erreur finit DESACTIVE.
    const chain = setupMock({
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
    expect(chain.deletedEventIds).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CTR7-4 - tous les litiges qui retiennent de l'argent bloquent le degel
// ---------------------------------------------------------------------------

describe('CTR7-4 - etats de litige bloquants et coherence des trois gestionnaires', () => {
  function frozenForDispute(): Record<string, unknown> {
    return {
      id: 'tenant-1',
      subscription_status: 'frozen',
      subscription_plan: 'pro',
      billing_interval: 'monthly',
      stripe_subscription_id: 'sub_1',
      freeze_reason: 'dispute',
      suspended_at: null,
      deleted_at: null,
    };
  }

  it('un litige warning_needs_response bloque le degel', async () => {
    const chain = setupMock({ tenant: frozenForDispute() });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockChargesList.mockResolvedValue({ data: [{ id: 'ch_1', disputed: true }] });
    mockDisputesList.mockResolvedValue({
      data: [{ id: 'dp_2', status: 'warning_needs_response' }],
    });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(0);
  });

  it('un litige warning_under_review bloque le degel', async () => {
    const chain = setupMock({ tenant: frozenForDispute() });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockChargesList.mockResolvedValue({ data: [{ id: 'ch_1', disputed: true }] });
    mockDisputesList.mockResolvedValue({ data: [{ id: 'dp_2', status: 'warning_under_review' }] });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(0);
  });

  it('un litige PERDU bloque le degel (l argent est parti)', async () => {
    const chain = setupMock({ tenant: frozenForDispute() });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockChargesList.mockResolvedValue({ data: [{ id: 'ch_1', disputed: true }] });
    mockDisputesList.mockResolvedValue({ data: [{ id: 'dp_2', status: 'lost' }] });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(0);
  });

  it('degele quand tous les autres litiges sont gagnes ou classes', async () => {
    const chain = setupMock({ tenant: frozenForDispute() });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockChargesList.mockResolvedValue({ data: [{ id: 'ch_1', disputed: true }] });
    mockDisputesList.mockResolvedValue({
      data: [
        { id: 'dp_2', status: 'won' },
        { id: 'dp_3', status: 'warning_closed' },
      ],
    });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(1);
    expect(chain.updatePayloads[0].is_active).toBe(true);
  });

  it('subscription.updated applique aussi le controle des litiges ouverts', async () => {
    const chain = setupMock({ tenant: frozenForDispute() });
    mockChargesList.mockResolvedValue({ data: [{ id: 'ch_1', disputed: true }] });
    mockDisputesList.mockResolvedValue({ data: [{ id: 'dp_9', status: 'needs_response' }] });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('active', 'sub_1'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    // Un litige retient de l'argent: le gel reste, seul `is_active` est
    // re-affirme sur le statut courant (donc false).
    expect(chain.updatePayloads).toEqual([{ is_active: false }]);
  });

  it('checkout.session.completed applique aussi le controle des litiges ouverts', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        stripe_subscription_id: 'sub_old',
        subscription_status: 'frozen',
        freeze_reason: 'dispute',
        suspended_at: null,
        deleted_at: null,
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockChargesList.mockResolvedValue({ data: [{ id: 'ch_1', disputed: true }] });
    mockDisputesList.mockResolvedValue({ data: [{ id: 'dp_9', status: 'under_review' }] });
    mockConstructEvent.mockReturnValue(checkoutEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(1);
    expect(chain.updatePayloads[0]).not.toHaveProperty('subscription_status');
    expect(chain.updatePayloads[0]).not.toHaveProperty('is_active');
  });

  it('ne va pas relire les litiges quand le gel n a pas pour cause un litige', async () => {
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        subscription_plan: 'pro',
        billing_interval: 'monthly',
        freeze_reason: 'trial_expired',
        suspended_at: null,
        deleted_at: null,
      },
    });
    mockConstructEvent.mockReturnValue(subscriptionUpdatedEvent('active'));

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    // Le degel d'un gel qui n'est pas un litige reste l'arbitrage deja acte.
    expect(chain.updatePayloads[0].is_active).toBe(true);
    expect(mockChargesList).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// RES-2 - PGRST204, la moitie non testee de la tolerance a la colonne absente
// ---------------------------------------------------------------------------

describe('RES-2 - PGRST204 est traite comme 42703 (colonne absente)', () => {
  it('rejoue l ecriture sans la cause sur un PGRST204', async () => {
    const chain = setupMock({
      tenant: { id: 'tenant-1', subscription_status: 'active' },
      updateErrors: [
        { code: 'PGRST204', message: "Could not find the 'freeze_reason' column of 'tenants'" },
      ],
    });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent('customer.subscription.deleted', { customer: 'cus_1', status: 'canceled' }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(2);
    expect(chain.updatePayloads[0].freeze_reason).toBe('subscription_deleted');
    expect(chain.updatePayloads[1]).toEqual({
      subscription_status: 'frozen',
      is_active: false,
      stripe_subscription_id: null,
    });
  });

  it('ne leve aucun gel quand la lecture de la cause rend un PGRST204', async () => {
    const chain = setupMock({
      freezeReasonColumnMissing: true,
      missingColumnCode: 'PGRST204',
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_1',
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads).toHaveLength(0);
    expect(chain.selectedColumns.some((c) => !c.includes('freeze_reason'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B-3 / B-4 (contre-audit FINAL-LOTS-8-9) - les deux coutures restantes
// ---------------------------------------------------------------------------

describe('B-3 - un gel SANS cause reste une cause a poser', () => {
  /**
   * La regle "ne jamais ecraser la cause" etait ecrite differemment des deux
   * cotes de la couture: `freezeReasonPreservingCause` exige une cause NON
   * VIDE, alors que `charge.dispute.created` ne regardait que le statut. Sur un
   * tenant `frozen` dont `freeze_reason` est NULL - l'etat de tout tenant gele
   * pendant la fenetre de tolerance, puisque c'est exactement ce que produit
   * `updateTolerantToMissingFreezeReason` - la cause `dispute` n'etait plus
   * posee, et `charge.dispute.closed` refusait ensuite de degeler. Un client qui
   * GAGNE son litige, et qui n'a rien a payer, restait gele jusqu'au roulement
   * de periode: un an sur une formule annuelle.
   */
  it('charge.dispute.created pose la cause dispute sur un tenant gele sans cause', async () => {
    const chain = setupMock({
      tenant: { id: 'tenant-1', subscription_status: 'frozen', freeze_reason: null },
    });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent('charge.dispute.created', {
        id: 'dp_1',
        payment_intent: { customer: 'cus_1' },
      }),
    );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);

    expect(chain.updatePayloads).toHaveLength(1);
    expect(chain.updatePayloads[0].is_active).toBe(false);
    expect(chain.updatePayloads[0].freeze_reason).toBe('dispute');
    expect(chain.updateFilters).toEqual([['id', 'tenant-1']]);
  });

  it('charge.dispute.closed degele alors le client qui gagne son litige', async () => {
    // La suite du scenario: sans la cause posee ci-dessus, ce degel est mort.
    const chain = setupMock({
      tenant: {
        id: 'tenant-1',
        subscription_status: 'frozen',
        stripe_subscription_id: 'sub_1',
        freeze_reason: 'dispute',
        suspended_at: null,
        deleted_at: null,
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockConstructEvent.mockReturnValue(disputeWonEvent());

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(chain.updatePayloads[0].subscription_status).toBe('active');
    expect(chain.updatePayloads[0].is_active).toBe(true);
    expect(chain.updatePayloads[0].freeze_reason).toBeNull();
  });
});

describe('B-4 - checkout.session.completed est fail-closed sur une lecture en echec', () => {
  /**
   * C'etait le SEUL des quatre gestionnaires a jeter l'erreur de lecture du
   * tenant (`const { data: existingTenant } = ...`). `existingTenant` valait
   * alors `undefined`, donc `isActiveUnlessLocked(status, undefined)` ne voyait
   * AUCUN verrou et ecrivait `is_active = true` sur un tenant suspendu ou
   * supprime par la plateforme - exactement ce que le commentaire de la ligne
   * promet de ne jamais faire.
   */
  it('renvoie 500 et n ecrit RIEN quand la ligne tenant est illisible', async () => {
    const chain = setupMock({ selectError: { message: 'timeout' } });
    mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });
    mockConstructEvent.mockReturnValue(checkoutEvent());

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
    expect(chain.updatePayloads).toHaveLength(0);
    // Comme pour CTR7-3: la ligne d'idempotence est retiree, pour que le rejeu
    // de Stripe reparte d'une ligne intacte et que le PREMIER paiement ne soit
    // pas perdu.
    expect(chain.deletedEventIds).toEqual(['evt_test']);
  });
});
