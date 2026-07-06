import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { runApiRoute } from '@/lib/api-route-context';

const DEFAULT_MAX_AGE_MINUTES = 30;

// Vercel cron jobs trigger a GET request (with Authorization: Bearer CRON_SECRET
// when the secret is set). A POST-only handler would 405 and the cron would never
// run - keep this as GET so the scheduled job actually fires.
export async function GET(request: Request) {
  return runApiRoute(request, async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      logger.error('CRON_SECRET is not configured');
      return NextResponse.json({ error: 'Service indisponible' }, { status: 503 });
    }

    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
    }

    const url = new URL(request.url);
    const maxAgeParam = url.searchParams.get('maxAgeMinutes');
    const maxAgeMinutes = maxAgeParam ? Number.parseInt(maxAgeParam, 10) : DEFAULT_MAX_AGE_MINUTES;
    if (!Number.isFinite(maxAgeMinutes) || maxAgeMinutes < 5 || maxAgeMinutes > 1440) {
      return NextResponse.json({ error: 'maxAgeMinutes invalide' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('expire_stale_payment_sessions', {
      p_max_age_minutes: maxAgeMinutes,
    });

    if (error) {
      logger.error('expire_stale_payment_sessions failed', error);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }

    const cleared = typeof data === 'number' ? data : 0;
    logger.info('Stale payment sessions reconciled', { cleared, maxAgeMinutes });

    return NextResponse.json({
      success: true,
      cleared,
      maxAgeMinutes,
    });
  });
}
