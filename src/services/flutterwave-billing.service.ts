import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { PLAN_TOTALS } from '@/lib/billing/pricing';
import { isFlutterwaveCurrency } from '@/lib/billing/flutterwave/config';
import type { FlutterwaveClient } from '@/lib/billing/flutterwave/client';
import { buildTxRef, parseTxRef } from '@/lib/billing/flutterwave/tx-ref';
import { classifyExistingSubscription } from '@/lib/billing/existing-subscription';
import { FREEZE_REASONS } from '@/lib/billing/freeze-reason';
import type { VerifiedTransaction } from '@/lib/billing/flutterwave/schemas';
import { ServiceError } from './errors';
import type { BillingInterval, SubscriptionPlan } from '@/types/billing';

type PayablePlan = Exclude<SubscriptionPlan, 'enterprise'>;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Duree de vie d'une tentative `pending`. Meme valeur que dans
 * `apply_flutterwave_payment` (SQL): au-dela, la tentative n'est plus reutilisee
 * et un paiement tardif doit couvrir le prix ACTUEL.
 */
const PENDING_TTL_DAYS = 7;

/**
 * Fenetre du rattrapage (B47). PLUS LARGE que la reutilisation des liens
 * (PENDING_TTL_DAYS): un lien redonne au jour 6 peut etre paye au jour 8. Avec
 * la meme borne, ce paiement n'etait jamais rattrape si le webhook se perdait
 * (argent pris, abonnement non prolonge). Un paiement tardif reste juge par
 * `apply_flutterwave_payment` (prix actuel, journal de remboursement sinon).
 */
const RECONCILE_WINDOW_DAYS = 30;

/** Un changement de plan n'est admis qu'a moins d'un jour de l'echeance (meme valeur que le SQL). */
const PLAN_CHANGE_WINDOW_MS = DAY_MS;

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  currency: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  subscription_current_period_end: string | null;
  stripe_subscription_id: string | null;
  freeze_reason: string | null;
  suspended_at: string | null;
  deleted_at: string | null;
}

/**
 * Gels qu'un paiement verifie a le droit de lever. MEME LISTE que
 * `apply_flutterwave_payment` (SQL): `dispute` et les causes inconnues restent geles.
 */
const UNFREEZABLE_REASONS: readonly string[] = [
  FREEZE_REASONS.TRIAL_EXPIRED,
  FREEZE_REASONS.PAST_DUE_OVERDUE,
  FREEZE_REASONS.STRIPE_UNPAID,
  FREEZE_REASONS.SUBSCRIPTION_DELETED,
  FREEZE_REASONS.REFUND,
  FREEZE_REASONS.FLUTTERWAVE_UNPAID,
];

interface PaymentRow {
  id: string;
  tenant_id: string;
  tx_ref: string;
  status: string;
  plan: PayablePlan;
  billing_interval: BillingInterval;
  amount: number | string;
  currency: string;
  payment_link: string | null;
  flw_transaction_id?: number | string | null;
}

const TENANT_COLUMNS =
  'id, slug, name, currency, subscription_status, subscription_plan, subscription_current_period_end, stripe_subscription_id, freeze_reason, suspended_at, deleted_at';

export type PaymentRejection =
  | 'NOT_SUCCESSFUL'
  | 'UNKNOWN_TX_REF'
  | 'WRONG_TENANT'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'TENANT_NOT_FOUND'
  /** Argent pris, NON applique: abonnement Stripe vivant. Remboursement a faire. */
  | 'STRIPE_CONFLICT'
  /** Argent pris, NON applique: autre plan avec plus d'un jour restant. Remboursement a faire. */
  | 'PLAN_CHANGE_NOT_ALLOWED'
  /** Argent pris, NON applique: tentative expiree payee sous le prix actuel. Remboursement a faire. */
  | 'EXPIRED_UNDERPAID'
  /** Argent pris, NON applique: restaurant suspendu ou gele pour une cause qu'un paiement ne leve pas. Remboursement a faire. */
  | 'TENANT_BLOCKED'
  /** Argent pris: la reference etait deja reglee par UNE AUTRE transaction. Remboursement a faire. */
  | 'ALREADY_SETTLED_BY_OTHER_TRANSACTION';

export type ProcessOutcome =
  | {
      kind: 'applied';
      tenantId: string;
      plan: PayablePlan;
      interval: BillingInterval;
      periodEnd: string;
      unfrozen: boolean;
    }
  | { kind: 'duplicate' }
  | { kind: 'rejected'; reason: PaymentRejection };

export interface StartPaymentInput {
  tenantId: string;
  customerEmail: string;
  plan: PayablePlan;
  interval: BillingInterval;
}

export interface StartPaymentResult {
  link: string;
  txRef: string;
  amount: number;
  currency: string;
}

export interface FlutterwaveBillingDeps {
  client: FlutterwaveClient;
  /** Origine publique de l'application (pour l'URL de retour). */
  baseUrl: string;
  /** Statut de l'abonnement chez Stripe, `null` si Stripe ne le connait plus. Leve en cas de panne. */
  retrieveStripeStatus: (subscriptionId: string) => Promise<string | null>;
  now?: () => Date;
}

/** Issues de `apply_flutterwave_payment` qui sont un refus: (issue SQL) -> (raison, message du journal). */
const SQL_REJECTIONS: Record<string, PaymentRejection> = {
  tenant_not_found: 'TENANT_NOT_FOUND',
  rejected_conflict: 'STRIPE_CONFLICT',
  rejected_plan_change: 'PLAN_CHANGE_NOT_ALLOWED',
  rejected_expired: 'EXPIRED_UNDERPAID',
  rejected_blocked: 'TENANT_BLOCKED',
  // Course de deux transactions sur la meme tentative: la ligne lue `pending`
  // a ete reglee entre-temps par l'autre (revue L142, B148).
  already_settled_by_other_transaction: 'ALREADY_SETTLED_BY_OTHER_TRANSACTION',
};

interface ApplyResult {
  outcome: string;
  period_end?: string;
  unfrozen?: boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/**
 * Encaissement d'un abonnement par Flutterwave (mobile money, carte).
 *
 * Flutterwave n'a pas de prelevement automatique fiable: UN paiement par
 * periode. Ce service lance le paiement (`startPayment`) puis l'applique
 * (`processTransaction`) apres l'avoir RELU aupres de l'API Flutterwave.
 * L'application elle-meme (reserver le paiement ET prolonger l'abonnement) est
 * UNE fonction SQL, donc UNE transaction: voir la migration.
 * Le client recu est service_role: chaque requete filtre donc par tenant.
 */
export function createFlutterwaveBillingService(
  supabase: SupabaseClient,
  deps: FlutterwaveBillingDeps,
) {
  const now = deps.now ?? (() => new Date());

  async function loadTenant(tenantId: string): Promise<TenantRow | null> {
    const { data, error } = await supabase
      .from('tenants')
      .select(TENANT_COLUMNS)
      .eq('id', tenantId)
      .maybeSingle();
    if (error) throw new ServiceError('Lecture du restaurant impossible', 'INTERNAL');
    return (data as TenantRow | null) ?? null;
  }

  /** Un abonnement Stripe attache au restaurant VIT-il ? Une panne Stripe leve: on ne conclut jamais "mort" dans le doute. */
  async function stripeIsLive(tenant: TenantRow): Promise<boolean> {
    const verdict = await classifyExistingSubscription({
      subscriptionId: tenant.stripe_subscription_id,
      status: tenant.subscription_status,
      retrieveStripeStatus: deps.retrieveStripeStatus,
    });
    return verdict.kind === 'live';
  }

  /**
   * Applique une transaction DEJA relue chez Flutterwave. Idempotent: la fonction
   * SQL reserve le paiement ET prolonge l'abonnement dans UNE transaction, donc
   * un webhook rejoue ou concurrent de la page de retour ne prolonge qu'UNE
   * fois, et une panne ne laisse jamais un paiement a moitie applique.
   */
  /** L'argent est PRIS et rien n'est applique: journal de remboursement a faire a la main. */
  function logRefundDue(
    payment: PaymentRow,
    tx: VerifiedTransaction,
    reason: PaymentRejection,
    extra: Record<string, unknown> = {},
  ) {
    logger.error('Flutterwave: paiement encaisse mais NON applique, remboursement a faire', {
      tenantId: payment.tenant_id,
      paymentId: payment.id,
      ...extra,
      flwTransactionId: tx.id,
      amount: tx.amount,
      currency: tx.currency,
      reason,
    });
  }

  async function applyVerified(
    tx: VerifiedTransaction,
    expectedTenantId?: string,
  ): Promise<ProcessOutcome> {
    if (tx.status !== 'successful') return { kind: 'rejected', reason: 'NOT_SUCCESSFUL' };

    const parsedRef = parseTxRef(tx.tx_ref);
    if (!parsedRef) return { kind: 'rejected', reason: 'UNKNOWN_TX_REF' };

    const { data: found, error: findError } = await supabase
      .from('flutterwave_payments')
      .select(
        'id, tenant_id, tx_ref, status, plan, billing_interval, amount, currency, flw_transaction_id',
      )
      .eq('tx_ref', tx.tx_ref)
      .eq('tenant_id', parsedRef.tenantId)
      .maybeSingle();
    if (findError) throw new ServiceError('Lecture du paiement impossible', 'INTERNAL');
    const payment = found as PaymentRow | null;
    if (!payment) return { kind: 'rejected', reason: 'UNKNOWN_TX_REF' };

    if (expectedTenantId && payment.tenant_id !== expectedTenantId) {
      return { kind: 'rejected', reason: 'WRONG_TENANT' };
    }
    if (tx.currency !== payment.currency) {
      return { kind: 'rejected', reason: 'CURRENCY_MISMATCH' };
    }
    // Doc officielle (verification): montant paye superieur OU EGAL a l'attendu.
    if (tx.amount < Number(payment.amount)) {
      return { kind: 'rejected', reason: 'AMOUNT_MISMATCH' };
    }
    if (payment.status !== 'pending') {
      // Meme transaction rejouee: doublon ordinaire. UNE AUTRE transaction sur une
      // reference deja reglee (le client a paye deux fois sur le meme lien): son
      // argent est pris et rien ne s'applique, comme les autres rejets.
      const recorded = payment.flw_transaction_id;
      if (recorded != null && Number(recorded) !== tx.id) {
        logRefundDue(payment, tx, 'ALREADY_SETTLED_BY_OTHER_TRANSACTION', {
          txRef: payment.tx_ref,
          recordedFlwTransactionId: Number(recorded),
        });
        return { kind: 'rejected', reason: 'ALREADY_SETTLED_BY_OTHER_TRANSACTION' };
      }
      return { kind: 'duplicate' };
    }

    const tenant = await loadTenant(payment.tenant_id);
    if (!tenant || tenant.deleted_at) {
      // B49: le client a paye sur un lien encore ouvert d'un restaurant supprime.
      logRefundDue(payment, tx, 'TENANT_NOT_FOUND');
      return { kind: 'rejected', reason: 'TENANT_NOT_FOUND' };
    }

    // Une panne Stripe leve: le webhook repondra 500 et Flutterwave relancera.
    const stripeLive = await stripeIsLive(tenant);

    const { data, error } = await supabase.rpc('apply_flutterwave_payment', {
      p_payment_id: payment.id,
      p_flw_transaction_id: tx.id,
      p_paid_amount: tx.amount,
      p_current_price: PLAN_TOTALS[payment.plan][payment.billing_interval],
      p_stripe_live: stripeLive,
      p_now: now().toISOString(),
    });
    if (error) {
      logger.error('Flutterwave: application du paiement impossible', error, {
        tenantId: payment.tenant_id,
        paymentId: payment.id,
      });
      throw new ServiceError('Application du paiement impossible', 'INTERNAL');
    }

    const result = data as ApplyResult | null;
    const outcome = result?.outcome ?? '';
    if (outcome === 'duplicate') return { kind: 'duplicate' };
    if (outcome === 'applied' && result?.period_end) {
      logger.info('Flutterwave: abonnement prolonge', {
        tenantId: payment.tenant_id,
        plan: payment.plan,
        interval: payment.billing_interval,
      });
      return {
        kind: 'applied',
        tenantId: payment.tenant_id,
        plan: payment.plan,
        interval: payment.billing_interval,
        periodEnd: result.period_end,
        unfrozen: result.unfrozen === true,
      };
    }

    const reason = SQL_REJECTIONS[outcome];
    if (!reason) {
      throw new ServiceError('Reponse inattendue de l application du paiement', 'INTERNAL');
    }
    // Toute issue de rejet, restaurant introuvable compris (B49), laisse l'argent pris.
    logRefundDue(payment, tx, reason);
    return { kind: 'rejected', reason };
  }

  return {
    /**
     * Cree la ligne `pending` (prix attendu) puis le lien de paiement heberge.
     * Une tentative non expiree du meme plan/periode au meme prix est REUTILISEE
     * (meme lien): cliquer dix fois ne cree pas dix lignes.
     */
    async startPayment(input: StartPaymentInput): Promise<StartPaymentResult> {
      const tenant = await loadTenant(input.tenantId);
      if (!tenant || tenant.deleted_at) {
        throw new ServiceError('Restaurant non trouve', 'NOT_FOUND');
      }
      if (!isFlutterwaveCurrency(tenant.currency)) {
        throw new ServiceError('Devise non prise en charge par le paiement mobile', 'VALIDATION');
      }

      // Suspendu ou gele pour une cause qu'un paiement ne leve pas: on n'ouvre pas de
      // paiement pour un acces qui resterait ferme (l'argent serait pris pour rien).
      if (tenant.suspended_at) {
        throw new ServiceError(
          'Ce restaurant est suspendu. Contactez le support ATTABL pour le reactiver.',
          'CONFLICT',
        );
      }
      if (
        tenant.subscription_status === 'frozen' &&
        !UNFREEZABLE_REASONS.includes(tenant.freeze_reason ?? '')
      ) {
        throw new ServiceError(
          'Ce restaurant est gele pour une raison qu un paiement ne leve pas. Contactez le support ATTABL.',
          'CONFLICT',
        );
      }

      // Un identifiant Stripe encore present n'est ecarte que si Stripe confirme
      // que l'abonnement est mort (canceled, incomplete_expired, introuvable).
      let live: boolean;
      try {
        live = await stripeIsLive(tenant);
      } catch (error) {
        logger.error('Flutterwave: statut d abonnement Stripe illisible', error, {
          tenantId: tenant.id,
        });
        throw new ServiceError(
          'Verification de l abonnement impossible. Reessayez dans un instant.',
          'INTERNAL',
        );
      }
      if (live) {
        throw new ServiceError('Ce restaurant a deja un abonnement par carte actif', 'CONFLICT');
      }

      // Meme plan: renouvellement possible a tout moment. Autre plan: seulement
      // a moins d'un jour de l'echeance (ou sans periode payee en cours).
      const periodEnd = tenant.subscription_current_period_end;
      if (
        tenant.subscription_status === 'active' &&
        tenant.subscription_plan !== input.plan &&
        periodEnd &&
        new Date(periodEnd).getTime() > now().getTime() + PLAN_CHANGE_WINDOW_MS
      ) {
        throw new ServiceError(
          `Changement d'offre possible a l'echeance du ${formatDate(periodEnd)}.`,
          'CONFLICT',
        );
      }

      const amount = PLAN_TOTALS[input.plan][input.interval];

      const cutoff = new Date(now().getTime() - PENDING_TTL_DAYS * DAY_MS).toISOString();
      const { data: reusable, error: reuseError } = await supabase
        .from('flutterwave_payments')
        .select('tx_ref, payment_link, amount, currency')
        .eq('tenant_id', tenant.id)
        .eq('status', 'pending')
        .eq('plan', input.plan)
        .eq('billing_interval', input.interval)
        .eq('amount', amount)
        .eq('currency', tenant.currency)
        .gt('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(5);
      if (reuseError) throw new ServiceError('Paiement indisponible', 'INTERNAL');
      const existing = ((reusable ?? []) as PaymentRow[]).find((row) => !!row.payment_link);
      if (existing?.payment_link) {
        return {
          link: existing.payment_link,
          txRef: existing.tx_ref,
          amount,
          currency: tenant.currency,
        };
      }

      const txRef = buildTxRef(tenant.id, input.plan, input.interval);
      const { error: insertError } = await supabase.from('flutterwave_payments').insert({
        tenant_id: tenant.id,
        tx_ref: txRef,
        plan: input.plan,
        billing_interval: input.interval,
        amount,
        currency: tenant.currency,
        status: 'pending',
        created_at: now().toISOString(),
      });
      if (insertError) {
        logger.error('Flutterwave: enregistrement de la tentative impossible', insertError, {
          tenantId: tenant.id,
        });
        throw new ServiceError('Paiement indisponible', 'INTERNAL');
      }

      const removeAttempt = async () => {
        const { error } = await supabase
          .from('flutterwave_payments')
          .delete()
          .eq('tx_ref', txRef)
          .eq('tenant_id', tenant.id)
          .eq('status', 'pending');
        if (error) {
          logger.warn('Flutterwave: tentative orpheline non nettoyee', { tenantId: tenant.id });
        }
      };

      let link: string;
      try {
        link = await deps.client.createPaymentLink({
          txRef,
          amount,
          currency: tenant.currency,
          redirectUrl: `${deps.baseUrl}/sites/${tenant.slug}/admin/subscription?fw=return`,
          customer: { email: input.customerEmail, name: tenant.name },
          title: 'ATTABL',
          description: `Abonnement ${input.plan} (${input.interval === 'yearly' ? 'annuel' : 'mensuel'})`,
          meta: { tenant_id: tenant.id, plan: input.plan, interval: input.interval },
        });
      } catch (error) {
        await removeAttempt();
        logger.error('Flutterwave: creation du lien impossible', error, { tenantId: tenant.id });
        throw new ServiceError('Paiement indisponible', 'INTERNAL');
      }

      const { error: linkError } = await supabase
        .from('flutterwave_payments')
        .update({ payment_link: link })
        .eq('tx_ref', txRef)
        .eq('tenant_id', tenant.id);
      if (linkError) {
        // Le lien fonctionne quand meme; seule la reutilisation est perdue.
        logger.warn('Flutterwave: lien non memorise', { tenantId: tenant.id });
      }
      return { link, txRef, amount, currency: tenant.currency };
    },

    /**
     * Applique un paiement apres l'avoir RELU chez Flutterwave. Idempotent: la
     * fonction SQL reserve le paiement ET prolonge l'abonnement dans UNE
     * transaction, donc un webhook rejoue ou concurrent de la page de retour ne
     * prolonge qu'UNE fois, et une panne ne laisse jamais un paiement a moitie
     * applique.
     *
     * @param expectedTenantId Restaurant de la session (route de confirmation).
     *   Absent pour le webhook, ou seule la ligne enregistree fait foi.
     */
    async processTransaction(
      transactionId: number,
      expectedTenantId?: string,
    ): Promise<ProcessOutcome> {
      return applyVerified(await deps.client.verifyTransaction(transactionId), expectedTenantId);
    },

    /**
     * Rattrapage: relit chez Flutterwave, PAR REFERENCE, les tentatives `pending`
     * des 30 derniers jours (RECONCILE_WINDOW_DAYS) et applique celles qui sont payees. Couvre un webhook
     * perdu et un client qui n'est pas revenu sur le site. Meme verification et
     * meme application idempotente que le webhook. Le lot tourne (colonne
     * `last_checked_at`): les plus anciennement verifiees passent d'abord.
     */
    async reconcilePending(
      limit = 100,
    ): Promise<{ checked: number; applied: number; errors: number }> {
      const cutoff = new Date(now().getTime() - RECONCILE_WINDOW_DAYS * DAY_MS).toISOString();
      const { data, error } = await supabase
        .from('flutterwave_payments')
        .select('id, tenant_id, tx_ref')
        .eq('status', 'pending')
        .gt('created_at', cutoff)
        .order('last_checked_at', { ascending: true, nullsFirst: true })
        .limit(limit);
      if (error) throw new ServiceError('Lecture des tentatives impossible', 'INTERNAL');

      let applied = 0;
      let errors = 0;
      const rows = (data ?? []) as Pick<PaymentRow, 'id' | 'tenant_id' | 'tx_ref'>[];
      for (const row of rows) {
        // Marque AVANT de verifier: une ligne qui echoue en boucle ne retient pas le lot.
        await supabase
          .from('flutterwave_payments')
          .update({ last_checked_at: now().toISOString() })
          .eq('id', row.id)
          .eq('tenant_id', row.tenant_id);
        try {
          const tx = await deps.client.verifyByReference(row.tx_ref);
          if (!tx) continue;
          // La verification par reference rend la transaction la plus RECENTE: un
          // echec posterieur sur le meme lien cacherait un paiement reussi plus
          // ancien. On relit alors la liste de la reference.
          const paid =
            tx.status === 'successful'
              ? tx
              : (await deps.client.listTransactionsByReference(row.tx_ref)).find(
                  (t) => t.status === 'successful',
                );
          if (!paid) continue;
          const outcome = await applyVerified(paid);
          if (outcome.kind === 'applied') applied += 1;
        } catch (err) {
          errors += 1;
          logger.error('Flutterwave: rattrapage impossible', err, { tenantId: row.tenant_id });
        }
      }
      return { checked: rows.length, applied, errors };
    },
  };
}

export type FlutterwaveBillingService = ReturnType<typeof createFlutterwaveBillingService>;
