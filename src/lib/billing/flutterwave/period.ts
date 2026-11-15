import type { BillingInterval } from '@/types/billing';

/** Ajoute des mois civils en UTC, en ramenant au dernier jour du mois si besoin (31 jan + 1 mois = 28/29 fev). */
export function addMonthsUtc(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export interface PeriodInput {
  now: Date;
  /** Fin de la periode payee en cours (`subscription_current_period_end`). */
  currentPeriodEnd: string | null;
  /** Fin d'essai, comptee seulement si le restaurant est encore en essai. */
  trialEndsAt: string | null;
  status: string | null;
  interval: BillingInterval;
}

export interface NewPeriod {
  start: Date;
  end: Date;
}

/**
 * La nouvelle periode commence a max(maintenant, fin de periode en cours): payer
 * en avance ne fait JAMAIS perdre de jours, payer en retard ne fait pas
 * rattraper un trou. Pendant un essai, les jours restants sont conserves (meme
 * regle que Stripe: `trial_period_days` = jours restants).
 */
export function computeNewPeriod(input: PeriodInput): NewPeriod {
  const candidates: number[] = [input.now.getTime()];
  if (input.currentPeriodEnd) {
    const end = new Date(input.currentPeriodEnd).getTime();
    if (Number.isFinite(end)) candidates.push(end);
  }
  if (input.status === 'trial' && input.trialEndsAt) {
    const end = new Date(input.trialEndsAt).getTime();
    if (Number.isFinite(end)) candidates.push(end);
  }
  const start = new Date(Math.max(...candidates));
  const end = addMonthsUtc(start, input.interval === 'yearly' ? 12 : 1);
  return { start, end };
}
