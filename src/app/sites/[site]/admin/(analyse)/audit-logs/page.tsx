import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import AuditLogClient from '@/components/admin/AuditLogClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';
import { adminPageMetadata } from '@/lib/admin-page-metadata';

export async function generateMetadata() {
  return adminPageMetadata('sidebar', 'navAuditLogs');
}

export const dynamic = 'force-dynamic';

export default async function AuditLogsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  await requireAdminPermission(site, 'audit.view');
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const supabase = await createClient();

  // Le droit `audit.view` (garde ci-dessus) decide seul; la base applique la
  // meme regle a la lecture de `audit_log` (politique sur `audit.view`).
  // Pre-fetch initial audit logs server-side (avoids RLS issues with anon client)
  const { data: initialLogs, count } = await supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .range(0, 24);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <AuditLogClient
        tenantId={tenant.id}
        initialLogs={(initialLogs as Record<string, unknown>[]) || []}
        initialCount={count || 0}
      />
    </div>
  );
}
