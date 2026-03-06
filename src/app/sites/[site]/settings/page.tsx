import { headers } from 'next/headers';
import ClientSettings from '@/components/tenant/ClientSettings';
import { getCachedTenant } from '@/lib/cache';
import { notFound } from 'next/navigation';

export default async function SettingsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getCachedTenant(tenantSlug);
  if (!tenant) return notFound();

  return (
    <ClientSettings
      tenantSlug={tenantSlug}
      tenantName={tenant.name}
      tenantLogo={tenant.logo_url || null}
      currency={tenant.currency || 'XAF'}
      supportedCurrencies={tenant.supported_currencies || [tenant.currency || 'XAF']}
    />
  );
}
