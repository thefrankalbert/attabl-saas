import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { canAccessFeature } from '@/lib/plans/features';
import { checkAndNotifyLowStock } from '@/services/notification.service';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

export async function POST() {
  try {
    const supabase = await createClient();
    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug');

    if (!tenantSlug) {
      return NextResponse.json({ error: 'Tenant non identifié' }, { status: 400 });
    }

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, subscription_plan, subscription_status, trial_ends_at')
      .eq('slug', tenantSlug)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant non trouvé' }, { status: 404 });
    }

    // Feature gate
    const hasAlerts = canAccessFeature(
      'stockAlerts',
      tenant.subscription_plan as SubscriptionPlan | null,
      tenant.subscription_status as SubscriptionStatus | null,
      tenant.trial_ends_at as string | null,
    );

    if (!hasAlerts) {
      return NextResponse.json({ skipped: true, reason: 'feature_not_available' });
    }

    // Non-blocking: fire and forget
    checkAndNotifyLowStock(tenant.id).catch(() => {});

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
