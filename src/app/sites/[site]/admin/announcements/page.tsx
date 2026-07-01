import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import AnnouncementsClient from '@/components/admin/AnnouncementsClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import type { Announcement } from '@/types/admin.types';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';

export const dynamic = 'force-dynamic';

export default async function AnnouncementsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  await requireAdminPermission(site, 'menu.edit');
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const supabase = await createClient();

  const { data: announcements } = await supabase
    .from('announcements')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false });

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <AnnouncementsClient
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        initialAnnouncements={(announcements as Announcement[]) || []}
      />
    </div>
  );
}
