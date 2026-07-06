import { getTenant } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import TenantNotFound from '@/components/admin/TenantNotFound';
import { redirectToLogin, redirectToUnauthorized } from '@/lib/auth/redirect-to-main';
import ReportsClient from '@/components/admin/ReportsClient';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';
import { FeatureUpgradeWall } from '@/components/admin/FeatureUpgradeWall';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  await requireAdminPermission(site, 'reports.view');
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  // Auth + role check: owner, admin, or manager only
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirectToLogin();
  }
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant.id)
    .single();
  if (!adminUser || !['owner', 'admin', 'manager'].includes(adminUser.role)) {
    redirectToUnauthorized();
  }

  // Plan gate: sales reports + best sellers are Pro+ (see pricing-data.ts).
  const hasReports = canAccessFeature(
    'canAccessReports',
    tenant.subscription_plan as SubscriptionPlan | null,
    tenant.subscription_status as SubscriptionStatus | null,
    tenant.trial_ends_at,
  );

  if (!hasReports) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <FeatureUpgradeWall
          feature="reports"
          checkoutUrl={`/sites/${tenantSlug}/admin/subscription`}
          tenantId={tenant.id}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ReportsClient tenantId={tenant.id} currency={tenant.currency || 'XAF'} />
    </div>
  );
}
