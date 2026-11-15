import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { runApiRoute } from '@/lib/api-route-context';
import { surveillerCron } from '@/lib/cron-monitor';
import { CRON_JOBS } from '@/lib/cron-jobs';
import { runFlutterwaveRenewals } from '@/lib/billing/flutterwave/wiring';

/**
 * Rappels de renouvellement (7 jours et 1 jour avant l'echeance) et gel apres le
 * delai de grace, pour les abonnements payes par Flutterwave.
 *
 * Meme controle d'acces que `freeze-expired-trials`: Bearer CRON_SECRET.
 * Planifie dans vercel.json (`0 2 * * *`, meme horaire que le moniteur Sentry).
 */
export async function GET(request: Request) {
  // L'horaire doit rester identique a celui de vercel.json.
  return surveillerCron(request, 'flutterwave-renewals', CRON_JOBS['flutterwave-renewals'], () =>
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
      const result = await runFlutterwaveRenewals();
      if (!result) return NextResponse.json({ success: true, enabled: false });
      return NextResponse.json({ success: true, enabled: true, ...result });
    } catch (error: unknown) {
      logger.error('flutterwave_renewals failed', error);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
  });
}
