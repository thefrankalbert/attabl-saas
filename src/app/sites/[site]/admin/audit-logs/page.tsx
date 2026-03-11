import { createClient } from '@/lib/supabase/server';
import { getCachedTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import AuditLogClient from '@/components/admin/AuditLogClient';

export default async function AuditLogsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getCachedTenant(tenantSlug);

  if (!tenant) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-app-text-secondary">Restaurant not found</h2>
      </div>
    );
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
    <div className="max-w-7xl mx-auto">
      <AuditLogClient
        tenantId={tenant.id}
        initialLogs={(initialLogs as Record<string, unknown>[]) || []}
        initialCount={count || 0}
      />
    </div>
  );
}
