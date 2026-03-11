import { createClient } from '@/lib/supabase/server';
import { getCachedTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import { SubscriptionManager } from '@/components/tenant/SubscriptionManager';

export default async function SubscriptionPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  // Récupérer le tenant et l'email du propriétaire (si possible)
  const tenant = await getCachedTenant(tenantSlug);

  if (!tenant) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-app-text-secondary">Restaurant non trouvé</h2>
      </div>
    );
  }

  const supabase = await createClient();

  // Pour l'instant, on mock l'email s'il n'est pas dispo, le checkout demandera
  // En production, il faut récupérer l'email de l'utilisateur connecté via auth.users
  // Fetch billing fields not included in getCachedTenant
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
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-text">Gestion de l&apos;abonnement</h1>
        <p className="text-sm text-app-text-secondary mt-1">
          Gérez votre plan et votre cycle de facturation
        </p>
      </div>
      <SubscriptionManager tenant={tenantWithEmail} />
    </div>
  );
}
