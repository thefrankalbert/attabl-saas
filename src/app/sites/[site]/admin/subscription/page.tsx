import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import { SubscriptionManager } from '@/components/tenant/SubscriptionManager';
import TenantNotFound from '@/components/admin/TenantNotFound';

export const dynamic = 'force-dynamic';

export default async function SubscriptionPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
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
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('tenants')
      .select('subscription_current_period_end, billing_interval, stripe_customer_id')
      .eq('id', tenant.id)
      .single(),
  ]);
  const tenantWithEmail = {
    ...tenant,
    email: user?.email,
    subscription_current_period_end: billingInfo?.subscription_current_period_end ?? null,
    billing_interval: billingInfo?.billing_interval ?? null,
  };

  return (
    <div className="max-w-7xl mx-auto h-full">
      <SubscriptionManager tenant={tenantWithEmail} />
    </div>
  );
}
