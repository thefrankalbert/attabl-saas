import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import TenantNotFound from '@/components/admin/TenantNotFound';
import SuggestionsClient from '@/components/admin/SuggestionsClient';

export const dynamic = 'force-dynamic';

export default async function SuggestionsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <SuggestionsClient
        tenantId={tenant.id}
        subscriptionPlan={tenant.subscription_plan}
        subscriptionStatus={tenant.subscription_status}
        trialEndsAt={tenant.trial_ends_at}
      />
    </div>
  );
}
