import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { canAccessFeature } from '@/lib/plans/features';
import { checkAndNotifyLowStock } from '@/services/notification.service';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import { stockAlertLimiter, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await stockAlertLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    const supabase = await createClient();

    // Auth check: only authenticated admin users can trigger stock alerts
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

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
