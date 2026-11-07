import { logger } from '@/lib/logger';
import type { SubscriptionStatus } from '@/types/billing';

/**
 * POURQUOI un tenant est gele.
 *
 * `frozen` est l'etat de gel GENERIQUE du projet: il est pose par un litige, par
 * la suppression de l'abonnement chez Stripe, par le cron des essais expires,
 * par le cron des impayes depasses, et par un statut Stripe impaye ou inconnu.
 * Aucune colonne ne distinguait ces causes: `charge.dispute.closed` levait donc
 * n'importe lequel de ces gels des qu'un litige etait gagne, et rendait un plan
 * payant a un tenant que Stripe ne couvre plus.
 *
 * INVARIANT, et c'est lui qui fait tout le travail:
 *
 *   `freeze_reason` est non nul SI ET SEULEMENT SI `subscription_status` vaut
 *   `frozen`.
 *
 * Il est tenu par `freezeReasonForStatus`, appelee a CHAQUE ecriture de statut -
 * pas seulement sur les chemins de gel. Consequence voulue: la cause est effacee
 * a chaque sortie de gel, donc un chemin de gel futur qui oublierait de l'ecrire
 * trouvera NULL, jamais une cause heritee d'un gel precedent. Et NULL ne leve
 * aucun gel. L'oubli d'un chemin coute alors un gel qui ne se leve pas tout seul
 * (visible, et repare par un paiement), jamais un acces rendu gratuitement.
 *
 * La relecture de l'etat de l'abonnement chez Stripe reste la SECONDE condition
 * du degel: la cause dit quel gel on a le droit de lever, Stripe dit si l'acces
 * est paye. Il faut les deux.
 */
export const FREEZE_REASONS = {
  /** Litige / chargeback ouvert chez Stripe (`charge.dispute.created`). */
  DISPUTE: 'dispute',
  /** Abonnement supprime chez Stripe (`customer.subscription.deleted`). */
  SUBSCRIPTION_DELETED: 'subscription_deleted',
  /** Stripe declare l'abonnement impaye, ou rend un statut inconnu (fail-closed). */
  STRIPE_UNPAID: 'stripe_unpaid',
  /** Essai termine sans aucune souscription (cron). */
  TRIAL_EXPIRED: 'trial_expired',
  /** Impaye au-dela du delai de relance (cron). */
  PAST_DUE_OVERDUE: 'past_due_overdue',
  /**
   * Paiement d'abonnement REMBOURSE EN ENTIER (`charge.refunded`). Le client a
   * recupere tout son argent: le servir gratuitement est une fuite de revenu.
   * Un remboursement PARTIEL ne gele rien (voir stripe-webhook/refund.ts).
   *
   * Reversible: souscrire a nouveau remet le statut, l'acces et efface la
   * cause (`checkout.session.completed`). `charge.dispute.closed` ne leve que
   * la cause `dispute`, donc il ne peut pas lever celui-ci - un remboursement
   * n'est pas un litige gagne.
   */
  REFUND: 'refund',
} as const;

export type FreezeReason = (typeof FREEZE_REASONS)[keyof typeof FREEZE_REASONS];

/** Nom de la colonne, en un seul endroit: les helpers de tolerance s'en servent. */
export const FREEZE_REASON_COLUMN = 'freeze_reason';

/** Postgres `undefined_column`: la colonne n'existe pas (encore). */
const UNDEFINED_COLUMN = '42703';

/** PostgREST: colonne absente du cache de schema. Meme cause, autre couche. */
const SCHEMA_CACHE_MISS = 'PGRST204';

/**
 * Exportee pour les chemins qui FILTRENT sur `freeze_reason` et non seulement
 * l'ecrivent. La tolerance par rejeu ne les sauve pas: retirer la colonne du
 * payload ne retire pas le filtre, l'erreur revient, et un webhook durablement
 * en erreur finit DESACTIVE par Stripe. Ces chemins doivent donc pouvoir dire
 * "colonne absente: il n'y a rien a faire ici" et continuer.
 */
export function isMissingFreezeReasonColumnError(error: unknown): boolean {
  return isMissingColumnError(error);
}

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === UNDEFINED_COLUMN || code === SCHEMA_CACHE_MISS;
}

/**
 * La cause a ecrire pour un statut donne: la cause fournie si ce statut est un
 * gel, `null` sinon. C'est le seul point qui tient l'invariant ci-dessus.
 */
export function freezeReasonForStatus(
  status: SubscriptionStatus,
  reason: FreezeReason,
): FreezeReason | null {
  return status === 'frozen' ? reason : null;
}

/**
 * Le code part en production AVANT la migration (regle du depot). Tant que la
 * colonne n'existe pas, un `update` qui la porte se solde par un `42703`, donc
 * par un 500 - et un webhook durablement en erreur finit DESACTIVE par Stripe,
 * ce qui ferait perdre `checkout.session.completed` et `invoice.paid` pour TOUS
 * les clients.
 *
 * Cette fonction rejoue donc l'ecriture sans la cause. L'ecriture refusee pour
 * colonne inconnue est atomique (aucune ligne touchee), le rejeu est donc sur.
 * Ce qui part alors est l'ancien comportement exact: le gel, sans sa cause.
 *
 * Un seul site de tolerance, partage par le webhook et le cron: c'est ce qui
 * evite de recopier ce code a chaque ecriture.
 */
export async function updateTolerantToMissingFreezeReason<R extends { error: unknown }>(
  payload: Record<string, unknown>,
  run: (payload: Record<string, unknown>) => PromiseLike<R>,
  context: Record<string, unknown> = {},
): Promise<R> {
  const result = await run(payload);
  if (!(FREEZE_REASON_COLUMN in payload) || !isMissingColumnError(result.error)) {
    return result;
  }

  logger.warn('Colonne freeze_reason absente: ecriture rejouee sans la cause du gel', context);
  const fallback = { ...payload };
  delete fallback[FREEZE_REASON_COLUMN];
  return run(fallback);
}

/**
 * Meme tolerance en lecture. Colonne absente = cause INCONNUE, et une cause
 * inconnue ne leve aucun gel: le comportement reste celui d'avant la migration.
 */
export async function selectTolerantToMissingFreezeReason<R extends { error: unknown }>(
  columns: string,
  run: (columns: string) => PromiseLike<R>,
  context: Record<string, unknown> = {},
): Promise<R> {
  const result = await run(columns);
  if (!isMissingColumnError(result.error)) return result;

  const fallback = columns
    .split(',')
    .map((column) => column.trim())
    .filter((column) => column !== FREEZE_REASON_COLUMN)
    .join(', ');
  if (fallback === columns) return result;

  logger.warn('Colonne freeze_reason absente: lecture rejouee sans la cause du gel', context);
  return run(fallback);
}
