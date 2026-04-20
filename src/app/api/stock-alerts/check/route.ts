import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { canAccessFeature } from '@/lib/plans/features';
import { checkAndNotifyLowStock } from '@/services/notification.service';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import { stockAlertLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

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

    // Verify user belongs to this tenant
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .single();

    if (!adminUser) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // Feature gate
    const hasAlerts = canAccessFeature(
      'canAccessInventory',
      tenant.subscription_plan as SubscriptionPlan | null,
      tenant.subscription_status as SubscriptionStatus | null,
      tenant.trial_ends_at as string | null,
    );

    if (!hasAlerts) {
      return NextResponse.json({ skipped: true, reason: 'feature_not_available' });
    }

    // Non-blocking: fire and forget
    checkAndNotifyLowStock(tenant.id).catch((err) => {
      logger.error('Stock alert check failed', err);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Stock alerts route error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
