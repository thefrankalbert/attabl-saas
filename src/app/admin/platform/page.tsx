import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSuperAdmin } from '@/lib/auth/require-super-admin';
import { PlatformConsole } from '@/components/admin/platform/PlatformConsole';
import { APP_VERSION } from '@/lib/app-version';
import type { PlatformTenantRow, PlatformUserRow } from '@/types/platform-admin.types';

export const dynamic = 'force-dynamic';

/**
 * Super-admin (god-mode) operations console.
 *
 * Strictly super-admin only - owners are bounced. Lists every tenant (live,
 * suspended and soft-deleted) plus every admin membership, so the operator can
 * suspend / soft-delete / restore tenants and ban / delete / restore users.
 * Data is read with the service_role client (spans tenants by design).
 */
export default async function PlatformConsolePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?redirect=/admin/platform');
  if (!(await isSuperAdmin(supabase, user.id))) notFound();

  const admin = createAdminClient();

  const [tenantsRes, usersRes] = await Promise.all([
    admin
      .from('tenants')
      .select(
        'id, name, slug, subscription_plan, subscription_status, is_active, deleted_at, suspended_at, suspend_reason, created_at',
      )
      // The private platform tenant hosts the super-admin membership; it is not a
      // real storefront and must never appear as a manageable tenant.
      .neq('slug', '__platform')
      .order('created_at', { ascending: false }),
    admin
      .from('admin_users')
      .select('id, email, full_name, role, tenant_id, is_active, banned_at, ban_reason, deleted_at')
      // Never list platform super-admin operator accounts as manageable staff.
      .not('is_super_admin', 'is', true),
  ]);

  const tenants: PlatformTenantRow[] = (tenantsRes.data as PlatformTenantRow[] | null) ?? [];
  const users: PlatformUserRow[] = (usersRes.data as PlatformUserRow[] | null) ?? [];

  return <PlatformConsole tenants={tenants} users={users} appVersion={APP_VERSION} />;
}
