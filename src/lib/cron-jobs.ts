/**
 * Les taches planifiees et leur frequence (UTC). Source unique pour les routes
 * (moniteur, battement) et la console de la plateforme. vercel.json doit dire
 * la meme chose: verifie par src/lib/__tests__/cron-jobs.test.ts.
 */
export const CRON_JOBS = {
  reminders: '* * * * *',
  'freeze-expired-trials': '0 2 * * *',
  'reconcile-payments': '0 3 * * *',
  'flutterwave-renewals': '0 2 * * *',
  'flutterwave-reconcile': '0 */6 * * *',
} as const;

export type CronJob = keyof typeof CRON_JOBS;

const MINUTE_MS = 60_000;

/**
 * Au-dela de ce silence, la tache est consideree comme ne passant plus:
 * l'intervalle prevu plus une marge (10 min pour la tache a la minute, 1 h
 * sinon). ponytail: trois formes reconnues (chaque minute, toutes les N
 * heures, chaque jour); toute autre forme est traitee comme quotidienne.
 */
export function cronSilenceLimitMs(schedule: string): number {
  if (schedule === '* * * * *') return 10 * MINUTE_MS;
  const everyHours = /^\d+ \*\/(\d+) \* \* \*$/.exec(schedule);
  const hours = everyHours ? Number(everyHours[1]) : 24;
  return (hours + 1) * 60 * MINUTE_MS;
}
