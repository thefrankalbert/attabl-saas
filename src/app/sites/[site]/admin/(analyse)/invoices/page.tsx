import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import InvoiceHistoryClient from '@/components/admin/InvoiceHistoryClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';
import { getTenantBillingIds } from '@/lib/billing/tenant-billing-ids';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  // Billing/Stripe surface - keep consistent with subscription (owner/admin only).
  const { tenantId } = await requireAdminPermission(site, 'settings.view');
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  // stripe_customer_id is not in getTenant, and not readable by `authenticated`:
  // service role, filtered on the tenant requireAdminPermission just verified.
  const stripeInfo = await getTenantBillingIds(tenantId);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <InvoiceHistoryClient hasStripeCustomer={!!stripeInfo?.stripe_customer_id} />
    </div>
  );
}
