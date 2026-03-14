import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import UsersClient from '@/components/admin/UsersClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import type { AdminUser, AdminRole } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

export default async function UsersPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const supabase = await createClient();

  // 1. Get Current User & Role
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div>Non autorisé</div>;
  }

  const { data: currentUserData } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant.id)
    .single();

  if (!currentUserData) {
    return <div>Accès refusé</div>;
  }

  // 2. Fetch Users List
  const { data: users } = await supabase
    .from('admin_users')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-7xl mx-auto">
      <UsersClient
        tenantId={tenant.id}
        currentUserRole={currentUserData.role as AdminRole}
        initialUsers={(users as AdminUser[]) || []}
      />
    </div>
  );
}
