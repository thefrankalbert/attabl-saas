import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import UsersClient from '@/components/admin/UsersClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import {
  paginationQuerySchema,
  toSupabaseRange,
  type ServerListPagination,
} from '@/lib/pagination';
import type { AdminUser, AdminRole } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

export default async function UsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const { site } = await params;
  const sp = await searchParams;
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

  const { page, pageSize } = paginationQuerySchema.parse({
    page: sp.page,
    pageSize: sp.pageSize,
  });
  const { from, to } = toSupabaseRange(page, pageSize);

  const { data: users, count } = await supabase
    .from('admin_users')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .range(from, to);

  const serverListPagination: ServerListPagination = {
    page,
    pageSize,
    total: count ?? users?.length ?? 0,
  };

  return (
    <div className="max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem] mx-auto h-full flex flex-col min-h-0">
      <UsersClient
        tenantId={tenant.id}
        currentUserRole={currentUserData.role as AdminRole}
        initialUsers={(users as AdminUser[]) || []}
        serverListPagination={serverListPagination}
      />
    </div>
  );
}
