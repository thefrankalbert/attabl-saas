import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import {
  FREEZE_REASONS,
  FREEZE_REASON_COLUMN,
  isMissingFreezeReasonColumnError,
  updateTolerantToMissingFreezeReason,
} from '@/lib/billing/freeze-reason';
import { ServiceError } from '../errors';
import type { StripeWebhookDeps } from './deps';
import { isActiveUnlessLocked, isHealthySubscriptionStatus } from './status';

/**
 * Les evenements de FACTURE: l'impaye, l'action de paiement requise, et la
 * facture encaissee - le seul evenement de ce webhook qui prouve un paiement.
 */

export async function handleInvoicePaymentFailed(
  { supabase }: StripeWebhookDeps,
  invoice: Stripe.Invoice,
): Promise<void> {
  const customerId = invoice.customer as string;

  // Marquer comme "past_due"
  const { data: tenant, error: tenantPaymentError } = await supabase
    .from('tenants')
    // CTR7-1: ce gestionnaire ecrit `is_active: true` ('past_due' est
    // entitlant). Il ne figurait dans AUCUNE liste d'ecrivains de
    // `is_active`, et un impaye sur un tenant suspendu encore `active`
    // chez Stripe rallumait donc l'acces - un ECHEC de paiement rendait
    // le service. Les verrous humains sont lus ici aussi.
    .select('id, subscription_status, suspended_at, deleted_at')
    .eq('stripe_customer_id', customerId)
    .single();

  if (tenantPaymentError || !tenant) {
    logger.warn('Payment failed: tenant not found', { customerId });
    return;
  }

  // ACT-19: n'appliquer 'past_due' QUE depuis un statut SAIN - la regle
  // commune a ce gestionnaire et a customer.subscription.updated, portee
  // par isEntitlingWithoutPayment / isHealthySubscriptionStatus.
  //
  // La garde ne testait que 'past_due' (idempotence). Or 'past_due' est
  // ENTITLANT (voir isSubscriptionUsable): l'ecrire sur un tenant 'frozen',
  // 'cancelled' ou 'paused' faisait d'un IMPAYE un ticket de reouverture
  // d'acces - un litige, une resiliation ou un essai expire etaient effaces
  // par l'echec de paiement suivant.
  if (!isHealthySubscriptionStatus(tenant.subscription_status)) {
    logger.info('invoice.payment_failed: statut non sain, aucune ecriture', {
      tenantId: tenant.id,
      currentStatus: tenant.subscription_status,
    });
    return;
  }

  const { error: updateError } = await updateTolerantToMissingFreezeReason(
    {
      subscription_status: 'past_due',
      // Ce gestionnaire etait le SEUL a ne pas reecrire is_active: il
      // laissait un statut entitlant avec une vitrine eteinte, l'etat
      // exact qui a deja casse des clients payants (voir isActiveForStatus).
      is_active: isActiveUnlessLocked('past_due', tenant),
      // On arrive forcement d'un statut sain: c'est donc la PREMIERE
      // transition vers l'impaye. Sans cette date, le cron de gel ne peut
      // pas borner l'impaye et le tenant garde son plan sans limite.
      past_due_since: new Date().toISOString(),
      // `past_due` n'est pas un gel: la cause s'efface. C'est cet
      // effacement systematique qui garantit qu'aucun gel futur ne
      // heritera d'une cause posee par un gel precedent.
      freeze_reason: null,
    },
    (payload) => supabase.from('tenants').update(payload).eq('id', tenant.id),
    { tenantId: tenant.id, handler: 'invoice.payment_failed' },
  );

  if (updateError) {
    logger.error('DB update failed for invoice.payment_failed', updateError, {
      tenantId: tenant.id,
    });
    // La route retire la ligne d'idempotence pour que Stripe retraite.
    throw new ServiceError('DB update failed', 'INTERNAL');
  }

  logger.warn('Payment failed for tenant', { tenantId: tenant.id });
}

/** 3D Secure or other payment action required: rien a ecrire, on trace. */
export function handleInvoicePaymentActionRequired(invoice: Stripe.Invoice): void {
  logger.info('Payment action required', {
    customerId: invoice.customer as string,
    invoiceId: invoice.id,
    hostedInvoiceUrl: invoice.hosted_invoice_url,
  });
}

/**
 * F10: filet idempotent. Si un customer.subscription.updated se perd, une
 * facture payee suffit a prouver que l'abonnement est sain - sans elle, un
 * tenant pouvait rester en past_due alors qu'il avait paye.
 */
export async function handleInvoicePaid(
  { supabase }: StripeWebhookDeps,
  invoice: Stripe.Invoice,
): Promise<void> {
  const customerId = invoice.customer as string;

  const { error: paidError } = await updateTolerantToMissingFreezeReason(
    {
      subscription_status: 'active',
      past_due_since: null,
      is_active: true,
      // Sortie d'impaye: aucune cause de gel ne doit survivre.
      freeze_reason: null,
    },
    (payload) =>
      supabase
        .from('tenants')
        .update(payload)
        .eq('stripe_customer_id', customerId)
        // 'frozen' est volontairement EXCLU: un gel pour litige
        // (chargeback) ne doit pas etre leve par la facture du mois
        // suivant. Seul un impaye regularise se recupere ici; un litige se
        // resout par dispute.closed.
        .eq('subscription_status', 'past_due')
        // CTR7-1: ce gestionnaire n'a aucune lecture prealable (filet
        // idempotent volontairement minimal), donc la garde ne peut etre
        // qu'un filtre d'ecriture. Son payload est EXCLUSIVEMENT un bloc
        // d'acces: rien n'est perdu a ne pas l'appliquer a un tenant que
        // la plateforme a coupe. Une facture payee ne leve pas une
        // suspension - seul `unsuspendTenant` le fait.
        .is('suspended_at', null)
        .is('deleted_at', null),
    { customerId, handler: 'invoice.paid' },
  );

  if (paidError) {
    logger.error('invoice.paid recovery failed', paidError);
    // La route retire la ligne d'idempotence pour que Stripe retraite.
    throw new ServiceError('DB update failed', 'INTERNAL');
  }

  // PREUVE D'ARGENT NEUF. Une facture peut etre marquee payee sans qu'un franc
  // soit rentre: facture a 0 (coupon 100 %, essai). Lever le gel pour
  // remboursement la-dessus rendrait l'acces gratuitement.
  //
  // Le rejeu d'un ANCIEN `invoice.paid` est deja bloque en amont par
  // l'idempotence (`INSERT ON CONFLICT DO NOTHING` sur `stripe_events`,
  // verifie dans la route): pas besoin d'horodater le gel pour s'en proteger.
  //
  // RESIDU ASSUME, ecrit pour ne pas etre decouvert plus tard: une facture
  // reglee depuis le SOLDE du client porte un `amount_paid` positif. Ce cas
  // suppose qu'ATTABL ait elle-meme accorde ce credit - une decision humaine -
  // et il n'est pas ferme ici.
  const argentNeuf = (invoice.amount_paid ?? 0) > 0;

  // CHEMIN DE SORTIE DU GEL POUR REMBOURSEMENT. Une facture payee est une
  // preuve d'ARGENT NEUF, et c'est la seule chose qui doit lever ce gel:
  // `customer.subscription.updated` ne le leve pas (un remboursement ne change
  // pas le statut Stripe, donc son mot ne prouve rien). Sans cette sortie, un
  // client rembourse puis revenu payer restait gele jusqu'a une nouvelle
  // souscription complete.
  //
  // Ecriture SEPAREE, et volontairement: l'ecriture ci-dessus est bornee a
  // `past_due` pour qu'une facture du mois suivant ne leve pas un gel pour
  // litige. Elargir son filtre aurait relache cette garde. Celle-ci ne cible
  // QUE la cause `refund`.
  const { error: refundError } = !argentNeuf
    ? { error: null }
    : await updateTolerantToMissingFreezeReason(
        {
          subscription_status: 'active',
          past_due_since: null,
          is_active: true,
          freeze_reason: null,
        },
        (payload) =>
          supabase
            .from('tenants')
            .update(payload)
            .eq('stripe_customer_id', customerId)
            .eq('subscription_status', 'frozen')
            .eq(FREEZE_REASON_COLUMN, FREEZE_REASONS.REFUND)
            // Un paiement ne leve pas une suspension plateforme (CTR7-1).
            .is('suspended_at', null)
            .is('deleted_at', null),
        { customerId, handler: 'invoice.paid', cause: FREEZE_REASONS.REFUND },
      );

  if (!argentNeuf) {
    logger.info('invoice.paid sans argent neuf: un gel pour remboursement n est pas leve', {
      customerId,
      amountPaid: invoice.amount_paid ?? 0,
    });
  }

  if (refundError) {
    if (isMissingFreezeReasonColumnError(refundError)) {
      // Colonne absente (fenetre avant migration): aucun gel pour
      // remboursement ne peut exister, il n'y a donc rien a lever. Lever une
      // erreur ici desactiverait le webhook pour TOUS les clients.
      logger.warn('invoice.paid: colonne freeze_reason absente, levee ignoree', { customerId });
    } else {
      logger.error('invoice.paid: levee du gel pour remboursement echouee', refundError);
      throw new ServiceError('DB update failed', 'INTERNAL');
    }
  }

  logger.info('Invoice paid, subscription state reconciled', { customerId });
}
