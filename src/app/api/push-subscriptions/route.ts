import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';
import { logger } from '@/lib/logger';
import { subscribeSchema } from '@/lib/validations/push-subscription.schema';
import { pushSubscriptionLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';

const deleteSchema = z.object({ endpoint: z.string().url() });

/**
 * B8: un meme telephone peut etre abonne aux alertes de PLUSIEURS restaurants
 * (un proprietaire de deux etablissements). L'unicite porte sur
 * (tenant_id, user_id, endpoint) depuis la migration 20261124160000; chaque
 * methode ne touche que la ligne du restaurant de la session.
 */
async function resolveTenantContext() {
  try {
    return { ok: true as const, ctx: await getAuthenticatedUserWithTenant() };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: error.message }, { status: error.status }),
      };
    }
    throw error;
  }
}

/**
 * POST /api/push-subscriptions - Subscribe to push notifications
 */
export async function POST(request: NextRequest) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await pushSubscriptionLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // PUSH-TENANT. La route ignorait le tenant du contexte et resolvait par
    // `order('created_at').limit(1)`, c'est-a-dire l'appartenance la PLUS
    // ANCIENNE. Un owner de deux etablissements s'abonnait donc toujours aux
    // alertes du premier, quel que soit celui qu'il avait ouvert - et recevait
    // les notifications de cuisine du mauvais restaurant.
    let tenantId: string;
    let user: Awaited<ReturnType<typeof getAuthenticatedUserWithTenant>>['user'];
    let supabase: Awaited<ReturnType<typeof getAuthenticatedUserWithTenant>>['supabase'];
    try {
      ({ tenantId, user, supabase } = await getAuthenticatedUserWithTenant());
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    const body = await request.json();
    const parsed = subscribeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }

    const { endpoint, p256dh, auth } = parsed.data;

    // Upsert subscription (unique on tenant_id + user_id + endpoint, B8)
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        tenant_id: tenantId,
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,user_id,endpoint' },
    );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Push subscription error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/push-subscriptions - Unsubscribe from push notifications
 */
export async function DELETE(request: NextRequest) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // Rate limiting
    const deleteIp = getClientIp(request);
    const { success: deleteAllowed } = await pushSubscriptionLimiter.check(deleteIp);
    if (!deleteAllowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const auth = await resolveTenantContext();
    if (!auth.ok) return auth.response;
    const { tenantId, user, supabase } = auth.ctx;

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }

    const { endpoint } = parsed.data;

    // Seule la ligne du restaurant courant: se desabonner de B ne coupe pas A.
    // Le navigateur garde son abonnement (voir usePushSubscription): sans ligne
    // serveur pour ce restaurant, rien ne lui est envoye.
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Push unsubscribe error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
