import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import UsersClient from '@/components/admin/UsersClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import {
  paginationQuerySchema,
  toSupabaseRange,
  type ServerListPagination,
} from '@/lib/pagination';
import { toPermissionMap, type PosteOverrides } from '@/lib/permissions';
import type { AdminUser } from '@/types/admin.types';
import type { StaffPoste } from '@/types/permission.types';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';
import { adminPageMetadata } from '@/lib/admin-page-metadata';

export async function generateMetadata() {
  return adminPageMetadata('sidebar', 'navUsers');
}

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

  const tErr = await getTranslations('errors');
  const supabase = await createClient();

  // 1. Get Current User & Role
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div>{tErr('notAuthenticated')}</div>;
  }

  // Ligne VIVANTE du membre connecte: son identifiant sert a la regle
  // "jamais d'action sur soi" de l'ecran.
  const { data: currentUserData } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (!currentUserData) {
    return <div>{tErr('permissionDenied')}</div>;
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

  // Reglages du restaurant par poste: la base sur laquelle s'affichent les
  // droits de chaque membre (le dialogue par personne doit savoir ce que
  // chaque poste donne dans CE restaurant).
  const { data: postePerms } = await supabase
    .from('poste_permissions')
    .select('poste, permissions')
    .eq('tenant_id', tenant.id);
  const posteOverrides: PosteOverrides = {};
  for (const row of postePerms ?? []) {
    const map = toPermissionMap(row.permissions);
    if (map) posteOverrides[row.poste as StaffPoste] = map;
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <UsersClient
        tenantId={tenant.id}
        currentAdminUserId={currentUserData.id as string}
        initialUsers={(users as AdminUser[]) || []}
        posteOverrides={posteOverrides}
        serverListPagination={serverListPagination}
      />
    </div>
  );
}
