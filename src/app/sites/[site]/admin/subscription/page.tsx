import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import { SubscriptionManager } from '@/components/tenant/SubscriptionManager';
import TenantNotFound from '@/components/admin/TenantNotFound';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';
import { getTenantBillingIds } from '@/lib/billing/tenant-billing-ids';
import { getTranslations } from 'next-intl/server';
import AdminSrTitle from '@/components/admin/AdminSrTitle';

export const dynamic = 'force-dynamic';

export default async function SubscriptionPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const tTitle = await getTranslations('sidebar');
  const { tenantId } = await requireAdminPermission(site, 'settings.view');
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  // Récupérer le tenant et l'email du propriétaire (si possible)
  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const supabase = await createClient();

  // Pour l'instant, on mock l'email s'il n'est pas dispo, le checkout demandera
  // En production, il faut récupérer l'email de l'utilisateur connecté via auth.users
  // Fetch billing fields not included in getTenant
  const [
    {
      data: { user },
    },
    { data: billingInfo },
    billingIds,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('tenants')
      .select('subscription_current_period_end, billing_interval')
      .eq('id', tenant.id)
      .single(),
    // Stripe ids are not readable by `authenticated`: service role, filtered on
    // the tenant whose access requireAdminPermission just verified.
    getTenantBillingIds(tenantId),
  ]);
  const tenantWithEmail = {
    ...tenant,
    email: user?.email,
    subscription_current_period_end: billingInfo?.subscription_current_period_end ?? null,
    billing_interval: billingInfo?.billing_interval ?? null,
    stripe_subscription_id: billingIds?.stripe_subscription_id ?? null,
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <AdminSrTitle label={tTitle('navSubscription')} />
      <SubscriptionManager tenant={tenantWithEmail} siteSlug={tenantSlug} />
    </div>
  );
}
