import type Stripe from 'stripe';
import { logger } from '@/lib/logger';

/**
 * Evenements Stripe qui ne changent pas l'acces du restaurant mais demandent
 * une action humaine (audit E11). Ils etaient consommes en silence par le
 * `default` de l'aiguillage. `logger.error` les envoie a Sentry, qui alerte.
 */

/**
 * La facture n'a pas pu etre finalisee (adresse ou taxe invalide, par
 * exemple): elle ne sera ni envoyee ni prelevee, et l'abonnement glisse vers
 * l'impaye sans que personne ne le sache.
 */
export function handleInvoiceFinalizationFailed(invoice: Stripe.Invoice): void {
  logger.error('Stripe invoice finalization failed', undefined, {
    invoiceId: invoice.id,
    customerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id,
    errorCode: invoice.last_finalization_error?.code ?? null,
    errorType: invoice.last_finalization_error?.type ?? null,
  });
}

/**
 * Alerte de fraude precoce de l'emetteur de la carte: un litige suit souvent.
 * Rembourser avant le litige evite les frais de litige; la decision reste
 * humaine (rembourser coupe l'acces paye).
 */
export function handleEarlyFraudWarning(warning: Stripe.Radar.EarlyFraudWarning): void {
  logger.error('Stripe early fraud warning', undefined, {
    warningId: warning.id,
    chargeId: typeof warning.charge === 'string' ? warning.charge : warning.charge?.id,
    fraudType: warning.fraud_type,
    actionable: warning.actionable,
  });
}
