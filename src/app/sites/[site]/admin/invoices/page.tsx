import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import InvoiceHistoryClient from '@/components/admin/InvoiceHistoryClient';
import TenantNotFound from '@/components/admin/TenantNotFound';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  // stripe_customer_id is not in getTenant — fetch it separately
  const supabase = await createClient();
  const { data: stripeInfo } = await supabase
    .from('tenants')
    .select('stripe_customer_id')
    .eq('id', tenant.id)
    .single();

  return (
    <div className="max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem] mx-auto">
      <InvoiceHistoryClient hasStripeCustomer={!!stripeInfo?.stripe_customer_id} />
    </div>
  );
}
