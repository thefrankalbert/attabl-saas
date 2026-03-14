import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import AdsClient from '@/components/admin/AdsClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import type { Ad } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

export default async function AdsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const supabase = await createClient();

  const { data: ads } = await supabase
    .from('ads')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('sort_order', { ascending: true });

  return (
    <div className="max-w-7xl mx-auto">
      <AdsClient tenantId={tenant.id} initialAds={(ads as Ad[]) || []} />
    </div>
  );
}
