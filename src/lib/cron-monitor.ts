import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';

/**
 * Surveille une tache planifiee avec un moniteur Sentry.
 *
 * Sans cela, une tache qui echoue ou que Vercel n'appelle plus ne previent
 * personne: des essais expires continuent de servir, des paiements restent en
 * attente. Sentry alerte sur un passage manque (marge de 30 min) ou en erreur.
 *
 * Seul un appel portant le secret de la tache est suivi. Un tiers qui frappe
 * l'URL sans secret ne doit pas pouvoir fabriquer un passage "ok" qui
 * masquerait une vraie panne. Le controle d'acces lui-meme reste dans la route.
 *
 * Chaque passage suivi note aussi son heure dans `cron_heartbeats`: c'est la
 * preuve lisible dans la console de la plateforme qu'une tache tourne vraiment
 * (les journaux Vercel restent vides quand tout va bien).
 */
export async function surveillerCron(
  request: Request,
  slug: string,
  schedule: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return handler();
  }

  const checkInId = Sentry.captureCheckIn(
    { monitorSlug: slug, status: 'in_progress' },
    {
      schedule: { type: 'crontab', value: schedule },
      checkinMargin: 30,
      maxRuntime: 10,
      timezone: 'UTC',
    },
  );

  let status: 'ok' | 'error' = 'error';
  const startedAt = Date.now();
  try {
    const response = await handler();
    // Seule une reponse 2xx compte comme un passage reussi.
    status = response.ok ? 'ok' : 'error';
    return response;
  } finally {
    Sentry.captureCheckIn({ checkInId, monitorSlug: slug, status });
    await Promise.all([
      Sentry.flush(2000),
      noterBattement(slug, schedule, status, Date.now() - startedAt),
    ]);
  }
}

const BATTEMENT_DELAI_MS = 3_000;

/** Ne leve jamais: un battement manque ne doit pas faire echouer la tache. */
async function noterBattement(
  job: string,
  schedule: string,
  status: 'ok' | 'error',
  durationMs: number,
): Promise<void> {
  try {
    // Import a la demande: le client service_role ne se charge que pour un
    // passage reel, pas a chaque import du module (tests des routes).
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { error } = await createAdminClient()
      .from('cron_heartbeats')
      .upsert(
        {
          job,
          schedule,
          last_run_at: new Date().toISOString(),
          last_status: status,
          last_duration_ms: Math.max(0, Math.round(durationMs)),
        },
        { onConflict: 'job' },
      )
      // Un pooler qui pend ne doit pas tenir la fonction jusqu'a son maxDuration.
      .abortSignal(AbortSignal.timeout(BATTEMENT_DELAI_MS));
    if (error) logger.warn('Battement de tache non enregistre', { job, error: error.message });
  } catch (err) {
    logger.warn('Battement de tache non enregistre', { job, error: String(err) });
  }
}
