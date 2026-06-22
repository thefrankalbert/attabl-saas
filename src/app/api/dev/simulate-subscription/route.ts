import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import type { BillingInterval, SubscriptionStatus } from '@/types/billing';

/**
 * DEV-ONLY subscription simulation.
 *
 * Reproduces the side effect of a successful Stripe `checkout.session.completed`
 * webhook (src/app/api/webhooks/stripe/route.ts) so the onboarding -> plan ->
 * payment funnel can be exercised end-to-end LOCALLY without a real Stripe
 * payment or webhook tunnel.
 *
 * HARD GUARD: this route returns 404 unless BOTH conditions hold:
 *   - process.env.NODE_ENV === 'development'
 *   - process.env.ALLOW_DEV_PAYMENT_SIM === 'true'
 * It can therefore never run in a production build.
 *
 * It writes the EXACT same tenant columns the webhook writes for a completed
 * paid checkout (stripe_customer_id, stripe_subscription_id, subscription_status,
 * subscription_plan, billing_interval). A completed non-trial paid checkout maps
 * to Stripe status `active` -> internal `active`, which is what we set here.
 */

const bodySchema = z.object({
  tenant_id: z.string().uuid(),
  plan: z.enum(['starter', 'pro', 'business']),
  interval: z.enum(['monthly', 'semiannual', 'yearly']),
});

function isEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_PAYMENT_SIM === 'true';
}

export async function POST(request: Request) {
  if (!isEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const body: unknown = await request.json();
    const result = bodySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tenant_id, plan, interval } = parsed;
  const supabase = createAdminClient();

  const mappedStatus: SubscriptionStatus = 'active';
  const billingInterval: BillingInterval = interval;

  const updateData: Record<string, unknown> = {
    stripe_customer_id: `dev_sim_cus_${tenant_id.slice(0, 8)}`,
    stripe_subscription_id: `dev_sim_sub_${tenant_id.slice(0, 8)}`,
    subscription_status: mappedStatus,
    subscription_plan: plan,
    billing_interval: billingInterval,
  };

  const { error: updateError } = await supabase
    .from('tenants')
    .update(updateData)
    .eq('id', tenant_id);

  if (updateError) {
    logger.error('[dev] simulate-subscription DB update failed', updateError, { tenant_id });
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
  }

  logger.info('[dev] subscription simulated', { tenant_id, plan, billingInterval, mappedStatus });
  return NextResponse.json({
    simulated: true,
    tenant_id,
    plan,
    interval: billingInterval,
    subscription_status: mappedStatus,
  });
}
