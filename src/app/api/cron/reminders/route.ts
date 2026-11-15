import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { runApiRoute } from '@/lib/api-route-context';
import { surveillerCron } from '@/lib/cron-monitor';
import { CRON_JOBS } from '@/lib/cron-jobs';
import { createPushService } from '@/services/push.service';
import { createReminderService } from '@/services/reminders/reminder.service';

/**
 * Moteur de rappels, chaque minute (vercel.json). Une minute est la precision
 * promise: "prete depuis 3 min" part entre 3 et 4 min apres le passage a prete.
 * service_role: le moteur lit tous les restaurants (operation de plateforme),
 * chaque requete filtre ensuite par restaurant.
 */
export async function GET(request: Request) {
  // L'horaire doit rester identique a celui de vercel.json.
  return surveillerCron(request, 'reminders', CRON_JOBS['reminders'], () => executer(request));
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

    const admin = createAdminClient();
    const report = await createReminderService(admin, {
      push: createPushService(admin),
    }).tick(new Date());
    return NextResponse.json(report);
  });
}
