import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import AnnouncementsClient from '@/components/admin/AnnouncementsClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import type { Announcement } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

export default async function AnnouncementsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
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
    <div className="max-w-7xl mx-auto">
      <AnnouncementsClient
        tenantId={tenant.id}
        initialAnnouncements={(announcements as Announcement[]) || []}
      />
    </div>
  );
}
