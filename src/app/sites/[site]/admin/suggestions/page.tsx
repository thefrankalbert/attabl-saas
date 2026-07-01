import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import TenantNotFound from '@/components/admin/TenantNotFound';
import SuggestionsClient from '@/components/admin/SuggestionsClient';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';

export const dynamic = 'force-dynamic';

export default async function SuggestionsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  await requireAdminPermission(site, 'menu.edit');
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <SuggestionsClient
        tenantId={tenant.id}
        subscriptionPlan={tenant.subscription_plan}
        subscriptionStatus={tenant.subscription_status}
        trialEndsAt={tenant.trial_ends_at}
      />
    </div>
  );
}
