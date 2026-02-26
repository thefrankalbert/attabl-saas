import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import InvoiceHistoryClient from '@/components/admin/InvoiceHistoryClient';

export default async function InvoicesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const supabase = await createClient();
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, stripe_customer_id, currency')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-neutral-600">Restaurant not found</h2>
      </div>
    );
  }

  return (
    <InvoiceHistoryClient
      tenantId={tenant.id}
      hasStripeCustomer={!!tenant.stripe_customer_id}
      currency={tenant.currency || 'XAF'}
    />
  );
}
