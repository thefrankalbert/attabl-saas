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
/** Delai avant de geler un impaye, aligne sur la duree de relance Stripe. */
const PAST_DUE_GRACE_DAYS = 15;

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
    // F6: le webhook customer.subscription.deleted met is_active=false; ce cron
    // ne le faisait pas. Or le middleware ne protege que /sites/<slug>/admin: la
    // vitrine et POST /api/orders restaient ouverts, et validateTenant ne
    // regardait que is_active. Un essai expire continuait donc d'encaisser.
    const freezeUpdate = { subscription_status: 'frozen', is_active: false } as const;

    const { data, error } = await supabase
      .from('tenants')
      .update(freezeUpdate)
      .eq('subscription_status', 'trial')
      .lt('trial_ends_at', nowIso)
      .is('stripe_subscription_id', null)
      .select('id');

    if (error) {
      logger.error('freeze_expired_trials failed', error);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }

    // F3: borner l'impaye. Sans borne, un tenant dont la relance Stripe s'acheve
    // sur "unpaid" garde son plan a vie. PAST_DUE_GRACE_DAYS est aligne sur la
    // duree de relance Stripe par defaut (~15 jours): geler plus tot punirait un
    // client dont le paiement va encore aboutir.
    const graceCutoff = new Date(
      Date.now() - PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: pastDue, error: pastDueError } = await supabase
      .from('tenants')
      .update(freezeUpdate)
      .eq('subscription_status', 'past_due')
      // Un past_due_since NULL ne satisfait pas la comparaison (NULL < x vaut
      // NULL en SQL): les tenants sans date sont exclus sans clause de plus.
      .lt('past_due_since', graceCutoff)
      .select('id');

    if (pastDueError) {
      logger.error('freeze_expired_past_due failed', pastDueError);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }

    const frozen = data?.length ?? 0;
    const frozenPastDue = pastDue?.length ?? 0;
    logger.info('Expired unpaid trials frozen', { frozen, frozenPastDue });

    return NextResponse.json({ success: true, frozen, frozenPastDue });
  });
}
