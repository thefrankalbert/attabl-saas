import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import AuditLogClient from '@/components/admin/AuditLogClient';
import TenantNotFound from '@/components/admin/TenantNotFound';

export const dynamic = 'force-dynamic';

export default async function AuditLogsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const supabase = await createClient();

  // Pre-fetch initial audit logs server-side (avoids RLS issues with anon client)
  const { data: initialLogs, count } = await supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false })
    .range(0, 24);

  return (
    <div className="max-w-7xl xl:max-w-[90rem] 2xl:max-w-[100rem] mx-auto">
      <AuditLogClient
        tenantId={tenant.id}
        initialLogs={(initialLogs as Record<string, unknown>[]) || []}
        initialCount={count || 0}
      />
    </div>
  );
}
