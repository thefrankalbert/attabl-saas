import { headers } from 'next/headers';
import ClientSettings from '@/components/tenant/ClientSettings';
import { getCachedTenant } from '@/lib/cache';
import { computeOpeningState } from '@/lib/opening-hours';
import { notFound } from 'next/navigation';
import type { OpeningHoursDay } from '@/types/admin.types';

const DAY_KEYS: OpeningHoursDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export default async function SettingsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getCachedTenant(tenantSlug);
  if (!tenant) return notFound();

  const now = new Date();
  const { isOpen } = computeOpeningState(tenant.opening_hours, now);
  const todaySlot = tenant.opening_hours?.[DAY_KEYS[now.getDay()]];
  const todayHours = todaySlot ? `${todaySlot.open} - ${todaySlot.close}` : null;

  return (
    <ClientSettings
      tenantSlug={tenantSlug}
      tenantName={tenant.name}
      tenantLogo={tenant.logo_url || null}
      tenantDescription={tenant.description || null}
      tenantAddress={tenant.address || null}
      tenantCity={tenant.city || null}
      tenantCountry={tenant.country || null}
      tenantPhone={tenant.phone || null}
      isOpen={isOpen}
      todayHours={todayHours}
      currency={tenant.currency || 'XAF'}
      supportedCurrencies={(tenant.supported_currencies as string[]) || [tenant.currency || 'XAF']}
    />
  );
}
