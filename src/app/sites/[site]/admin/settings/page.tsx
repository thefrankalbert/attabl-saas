import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import { SettingsForm } from '@/components/admin/settings/SettingsForm';
import { PushOptIn } from '@/components/admin/PushOptIn';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface SettingsPageProps {
  params: Promise<{ site: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) notFound();

  return (
    <div className="h-full flex flex-col overflow-hidden max-w-7xl mx-auto">
      <SettingsForm
        tenant={{
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          description: tenant.description,
          logo_url: tenant.logo_url,
          primary_color: tenant.primary_color,
          secondary_color: tenant.secondary_color,
          address: tenant.address,
          city: tenant.city,
          country: tenant.country,
          phone: tenant.phone,
          establishment_type: tenant.establishment_type,
          table_count: tenant.table_count,
          notification_sound_id: tenant.notification_sound_id,
          currency: tenant.currency,
          enable_tax: tenant.enable_tax,
          tax_rate: tenant.tax_rate,
          enable_service_charge: tenant.enable_service_charge,
          service_charge_rate: tenant.service_charge_rate,
          idle_timeout_minutes: tenant.idle_timeout_minutes,
          screen_lock_mode: tenant.screen_lock_mode,
        }}
      />

      <div className="mt-4 shrink-0">
        <PushOptIn tenantId={tenant.id} />
      </div>
    </div>
  );
}
