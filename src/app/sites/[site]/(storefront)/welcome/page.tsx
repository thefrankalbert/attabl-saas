import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getStorefrontMessages } from '@/i18n/storefront-messages';
import { NextIntlClientProvider } from 'next-intl';
import { getCachedTenant } from '@/lib/cache';
import { computeOpeningState } from '@/lib/opening-hours';
import { resolveTenantTimezone } from '@/lib/timezones';
import WelcomeSplash from '@/components/tenant/client/WelcomeSplash';

export default async function WelcomePage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getCachedTenant(tenantSlug);
  if (!tenant) return notFound();

  const messages = await getStorefrontMessages();
  const { isOpen } = computeOpeningState(
    tenant.opening_hours,
    new Date(),
    resolveTenantTimezone(tenant),
  );
  const location = [tenant.city, tenant.country].filter(Boolean).join(', ');

  return (
    <NextIntlClientProvider messages={messages}>
      <WelcomeSplash
        tenantSlug={tenantSlug}
        tenantName={tenant.name}
        tenantLogo={tenant.logo_url || null}
        location={location || null}
        isOpen={isOpen}
      />
    </NextIntlClientProvider>
  );
}
