import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import CouponsClient from '@/components/admin/CouponsClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';

export const dynamic = 'force-dynamic';

export default async function CouponsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  await requireAdminPermission(site, 'menu.edit');
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
    <div className="flex-1 min-h-0 flex flex-col">
      <CouponsClient
        tenantId={tenant.id}
        initialCoupons={coupons || []}
        currency={tenant.currency || 'XAF'}
      />
    </div>
  );
}
