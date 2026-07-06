import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { runApiRoute } from '@/lib/api-route-context';

/**
 * Freeze trials that expired without ever subscribing.
 *
 * A tenant that signs up starts on a 14-day (or 7-day A/B) trial with
 * subscription_status='trial' and NO Stripe subscription. If they never pay,
 * nothing ever freezes them: there is no Stripe subscription, so no webhook
 * fires, and getEffectivePlan/isSubscriptionUsable still treat 'trial' as
 * usable. This cron closes that gap by flipping such tenants to 'frozen', which
 * the middleware already redirects to the subscription page (proxy.ts B2).
 *
 * Tenants that DID subscribe (stripe_subscription_id set) are left untouched -
 * Stripe drives their lifecycle via the webhook.
 *
 * subscription_status is a service_role-only column (see migration
 * 20260420000002_restrict_tenant_billing_updates), so this must run with the
 * admin client.
 */
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

    const nowIso = new Date().toISOString();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('tenants')
      .update({ subscription_status: 'frozen' })
      .eq('subscription_status', 'trial')
      .lt('trial_ends_at', nowIso)
      .is('stripe_subscription_id', null)
      .select('id');

    if (error) {
      logger.error('freeze_expired_trials failed', error);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }

    const frozen = data?.length ?? 0;
    logger.info('Expired unpaid trials frozen', { frozen });

    return NextResponse.json({ success: true, frozen });
  });
}
