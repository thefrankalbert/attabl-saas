import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import KitchenClient from '@/components/admin/KitchenClient';
import TenantNotFound from '@/components/admin/TenantNotFound';

export const dynamic = 'force-dynamic';

export default async function KitchenPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  return (
    <KitchenClient
      tenantId={tenant.id}
      tenantName={tenant.name}
      notificationSoundId={tenant.notification_sound_id ?? undefined}
    />
  );
}
