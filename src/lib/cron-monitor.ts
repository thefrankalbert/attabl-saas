import * as Sentry from '@sentry/nextjs';

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
  try {
    const response = await handler();
    status = response.status >= 500 ? 'error' : 'ok';
    return response;
  } finally {
    Sentry.captureCheckIn({ checkInId, monitorSlug: slug, status });
    await Sentry.flush(2000);
  }
}
