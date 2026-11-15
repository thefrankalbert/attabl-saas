import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { runApiRoute } from '@/lib/api-route-context';
import { surveillerCron } from '@/lib/cron-monitor';
import { runFlutterwaveReconcile } from '@/lib/billing/flutterwave/wiring';

/**
 * Rattrapage des paiements Flutterwave: relit, par reference, les tentatives
 * `pending` des 7 derniers jours et applique celles qui sont payees. Couvre un
 * webhook perdu et un client qui n'est pas revenu sur le site.
 *
 * Meme controle d'acces que les autres taches: Bearer CRON_SECRET. Idempotent:
 * l'application d'un paiement ne prolonge jamais deux fois.
 */
export async function GET(request: Request) {
  // L'horaire doit rester identique a celui de vercel.json.
  return surveillerCron(request, 'flutterwave-reconcile', '0 */6 * * *', () => executer(request));
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
      const result = await runFlutterwaveReconcile();
      if (!result) return NextResponse.json({ success: true, enabled: false });
      return NextResponse.json({ success: true, enabled: true, ...result });
    } catch (error: unknown) {
      logger.error('flutterwave_reconcile failed', error);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
  });
}
