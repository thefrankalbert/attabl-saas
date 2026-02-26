import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import AuditLogClient from '@/components/admin/AuditLogClient';

export default async function AuditLogsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const supabase = await createClient();
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-neutral-600">Restaurant not found</h2>
      </div>
    );
  }

  return <AuditLogClient tenantId={tenant.id} />;
}
