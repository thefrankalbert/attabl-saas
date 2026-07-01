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
import type { PermissionMap } from '@/types/permission.types';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';

export const dynamic = 'force-dynamic';

export default async function UsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const { site } = await params;
  await requireAdminPermission(site, 'team.view');
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

  // Exclude soft-deleted memberships and platform super-admin rows: the owner
  // manages only their own active staff, never a god-mode operator account that
  // happens to be anchored to this tenant.
  const { data: users, count } = await supabase
    .from('admin_users')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .not('is_super_admin', 'is', true)
    .order('created_at', { ascending: false })
    .range(from, to);

  const serverListPagination: ServerListPagination = {
    page,
    pageSize,
    total: count ?? users?.length ?? 0,
  };

  // Tenant-level role overrides: used as the baseline against which a member's
  // individual permission overrides are displayed (the per-user dialog needs to
  // know what each role grants by default in THIS tenant).
  const { data: rolePerms } = await supabase
    .from('role_permissions')
    .select('role, permissions')
    .eq('tenant_id', tenant.id);
  const roleOverrides: Record<string, PermissionMap> = {};
  for (const rp of rolePerms ?? []) {
    roleOverrides[rp.role as string] = (rp.permissions ?? {}) as PermissionMap;
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <UsersClient
        tenantId={tenant.id}
        currentUserRole={currentUserData.role as AdminRole}
        initialUsers={(users as AdminUser[]) || []}
        roleOverrides={roleOverrides}
        serverListPagination={serverListPagination}
      />
    </div>
  );
}
