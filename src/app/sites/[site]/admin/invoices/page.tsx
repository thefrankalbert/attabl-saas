import { createClient } from '@/lib/supabase/server';
import { getCachedTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import InvoiceHistoryClient from '@/components/admin/InvoiceHistoryClient';

export default async function InvoicesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getCachedTenant(tenantSlug);

  if (!tenant) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-app-text-secondary">Restaurant not found</h2>
      </div>
    );
  }

  // stripe_customer_id is not in getCachedTenant — fetch it separately
  const supabase = await createClient();
  const { data: stripeInfo } = await supabase
    .from('tenants')
    .select('stripe_customer_id')
    .eq('id', tenant.id)
    .single();

  return (
    <div className="max-w-7xl mx-auto">
      <InvoiceHistoryClient
        tenantId={tenant.id}
        hasStripeCustomer={!!stripeInfo?.stripe_customer_id}
        currency={tenant.currency || 'XAF'}
      />
    </div>
  );
}
