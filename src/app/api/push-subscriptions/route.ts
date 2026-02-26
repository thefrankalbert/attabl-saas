import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const subscribeSchema = z.object({
  tenantId: z.string().uuid(),
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

/**
 * POST /api/push-subscriptions — Subscribe to push notifications
 */
export async function POST(request: NextRequest) {
  try {
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

    const { tenantId, endpoint, p256dh, auth } = parsed.data;

    // Upsert subscription (unique on user_id + endpoint)
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        tenant_id: tenantId,
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
 * DELETE /api/push-subscriptions — Unsubscribe from push notifications
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endpoint } = (await request.json()) as { endpoint?: string };

    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint required' }, { status: 400 });
    }

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
