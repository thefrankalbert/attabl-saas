import { createClient } from '@/lib/supabase/server';
import { getCachedTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import AnnouncementsClient from '@/components/admin/AnnouncementsClient';
import { AlertCircle } from 'lucide-react';
import type { Announcement } from '@/types/admin.types';

export const revalidate = 300;

export default async function AnnouncementsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getCachedTenant(tenantSlug);

  if (!tenant) {
    return (
      <div className="p-8">
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl max-w-md">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-red-700 font-bold">Tenant non trouvé</h3>
          </div>
        </div>
      </div>
    );
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
