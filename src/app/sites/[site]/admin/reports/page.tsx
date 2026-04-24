import { getTenant } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import TenantNotFound from '@/components/admin/TenantNotFound';
import { redirectToLogin, redirectToUnauthorized } from '@/lib/auth/redirect-to-main';
import ReportsClient from '@/components/admin/ReportsClient';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
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

  return (
    <div className="flex-1 min-h-0 flex flex-col max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem] mx-auto">
      <ReportsClient tenantId={tenant.id} currency={tenant.currency || 'XAF'} />
    </div>
  );
}
