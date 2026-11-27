import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { runApiRoute } from '@/lib/api-route-context';
import { surveillerCron } from '@/lib/cron-monitor';
import { CRON_JOBS } from '@/lib/cron-jobs';
import { sendTrialIdleEmails } from '@/services/trigger-emails.service';

/**
 * B104: relance des essais inactifs depuis 48 h, une fois par jour
 * (vercel.json). Calculee auparavant pendant une visite de l'administration,
 * elle partait a quelqu'un d'actif et jamais a un vrai inactif.
 * service_role: lecture de tous les restaurants en essai (operation de
 * plateforme), chaque ecriture vise ensuite un seul restaurant.
 */
export async function GET(request: Request) {
  // L'horaire doit rester identique a celui de vercel.json.
  return surveillerCron(request, 'trial-idle-emails', CRON_JOBS['trial-idle-emails'], () =>
    executer(request),
  );
}

async function executer(request: Request): Promise<Response> {
  return runApiRoute(request, async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      logger.error('CRON_SECRET is not configured');
      return NextResponse.json({ error: 'Service indisponible' }, { status: 503 });
    }
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
    }

    try {
      const report = await sendTrialIdleEmails(createAdminClient(), new Date());
      logger.info('Trial idle emails', report);
      return NextResponse.json(report);
    } catch (error) {
      logger.error('Trial idle emails failed', error);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
  });
}
