import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import CouponsClient from '@/components/admin/CouponsClient';
import TenantNotFound from '@/components/admin/TenantNotFound';

export const dynamic = 'force-dynamic';

export default async function CouponsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const supabase = await createClient();

  const { data: coupons } = await supabase
    .from('coupons')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem] mx-auto">
      <CouponsClient
        tenantId={tenant.id}
        initialCoupons={coupons || []}
        currency={tenant.currency || 'XAF'}
      />
    </div>
  );
}
