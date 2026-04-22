import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { ShieldCheck } from 'lucide-react';
import { redirectToLogin } from '@/lib/auth/redirect-to-main';
import { PermissionsClient } from '@/components/admin/settings/PermissionsClient';
import type { PermissionMap } from '@/types/permission.types';

export const dynamic = 'force-dynamic';

export default async function PermissionsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const supabase = await createClient();

  // ─── Auth check ──────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirectToLogin();
  }

  // Resolve tenant from URL slug
  const tenant = await getTenant(site);

  if (!tenant) {
    redirectToLogin();
  }

  // Check role - must be owner for this specific tenant
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant.id)
    .single();

  if (!adminUser || adminUser.role !== 'owner') {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <div className="w-16 h-16 bg-red-500/10 rounded-[10px] flex items-center justify-center mb-4">
          <ShieldCheck className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-app-text">Access Denied</h2>
        <p className="text-sm text-app-text-secondary mt-2">Owner access required</p>
      </div>
    );
  }

  const tenantId = adminUser.tenant_id as string;

  // ─── Fetch existing role overrides ───────────────────
  const { data: rolePerms } = await supabase
    .from('role_permissions')
    .select('*')
    .eq('tenant_id', tenantId);

  // Build overrides map
  const overrides: Record<string, PermissionMap> = {};
  if (rolePerms) {
    for (const rp of rolePerms) {
      const role = rp.role as string;
      const perms = rp.permissions as PermissionMap | null;
      if (perms && Object.keys(perms).length > 0) {
        overrides[role] = perms;
      }
    }
  }

  return (
    <div className="max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem] mx-auto">
      <PermissionsClient tenantId={tenantId} initialOverrides={overrides} />
    </div>
  );
}
