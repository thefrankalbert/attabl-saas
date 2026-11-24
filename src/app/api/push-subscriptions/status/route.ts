import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';
import { logger } from '@/lib/logger';
import { pushSubscriptionLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';

const statusSchema = z.object({ endpoint: z.string().url() });

/**
 * POST /api/push-subscriptions/status - cet appareil est-il abonne aux alertes
 * du restaurant COURANT ? (B8: le bouton lisait seulement le navigateur, qui
 * repond "abonne" des qu'un autre restaurant l'est.)
 *
 * POST et pas GET: l'endpoint est un identifiant d'appareil. Dans une URL, il
 * finirait dans les journaux d'acces et les traces (contre-audit 1).
 */
export async function POST(request: NextRequest) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    const { success: allowed } = await pushSubscriptionLimiter.check(getClientIp(request));
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const parsed = statusSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Donnees invalides' }, { status: 400 });
    }

    let ctx: Awaited<ReturnType<typeof getAuthenticatedUserWithTenant>>;
    try {
      ctx = await getAuthenticatedUserWithTenant();
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    const { data, error } = await ctx.supabase
      .from('push_subscriptions')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.user.id)
      .eq('endpoint', parsed.data.endpoint)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ subscribed: !!data });
  } catch (error) {
    logger.error('Push subscription status error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
