import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { subscribeSchema } from '@/lib/validations/push-subscription.schema';
import { pushSubscriptionLimiter, getClientIp } from '@/lib/rate-limit';

const deleteSchema = z.object({ endpoint: z.string().url() });

/**
 * POST /api/push-subscriptions - Subscribe to push notifications
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await pushSubscriptionLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = subscribeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }

    const { endpoint, p256dh, auth } = parsed.data;

    // Derive tenant_id from admin_users - never trust client-supplied tenant_id
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!adminUser) {
      return NextResponse.json({ error: 'Tenant not found for user' }, { status: 403 });
    }

    // Upsert subscription (unique on user_id + endpoint)
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        tenant_id: adminUser.tenant_id,
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
      },
      { onConflict: 'user_id,endpoint' },
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
    // Rate limiting
    const deleteIp = getClientIp(request);
    const { success: deleteAllowed } = await pushSubscriptionLimiter.check(deleteIp);
    if (!deleteAllowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }

    const { endpoint } = parsed.data;

    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Push unsubscribe error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
