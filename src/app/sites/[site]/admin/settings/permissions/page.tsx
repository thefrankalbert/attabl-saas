import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { getTenant } from '@/lib/cache';
import { ShieldCheck } from 'lucide-react';
import { redirectToLogin } from '@/lib/auth/redirect-to-main';
import { PermissionsClient } from '@/components/admin/settings/PermissionsClient';
import { toPermissionMap, type PosteOverrides } from '@/lib/permissions';
import type { StaffPoste } from '@/types/permission.types';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';
import { adminPageMetadata } from '@/lib/admin-page-metadata';

export async function generateMetadata() {
  return adminPageMetadata('sidebar', 'navPermissions');
}

export const dynamic = 'force-dynamic';

export default async function PermissionsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  await requireAdminPermission(site, 'settings.edit');
  const supabase = await createClient();

  // --- Auth check --------------------------------------
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

  // Acte reserve au proprietaire VIVANT de ce restaurant (la base applique la
  // meme regle a l'ecriture: `is_tenant_owner`).
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .contains('postes', ['owner'])
    .maybeSingle();

  if (!adminUser) {
    const t = await getTranslations('permissions');
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <div className="w-16 h-16 border border-[var(--border)] rounded-2xl flex items-center justify-center mb-4">
          <ShieldCheck className="w-8 h-8 text-[var(--destructive)]" />
        </div>
        <h2 className="text-lg font-medium text-app-text">{t('accessDenied')}</h2>
        <p className="text-sm text-app-text-secondary mt-2">{t('ownerOnlyHint')}</p>
      </div>
    );
  }

  const tenantId = adminUser.tenant_id as string;

  // --- Reglages existants, par poste -----------------
  const { data: postePerms } = await supabase
    .from('poste_permissions')
    .select('poste, permissions')
    .eq('tenant_id', tenantId);

  const overrides: PosteOverrides = {};
  for (const row of postePerms ?? []) {
    const perms = toPermissionMap(row.permissions);
    if (perms && Object.keys(perms).length > 0) {
      overrides[row.poste as StaffPoste] = perms;
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <PermissionsClient initialOverrides={overrides} />
    </div>
  );
}
