import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { SettingsForm } from '@/components/admin/settings/SettingsForm';
import { notFound } from 'next/navigation';

interface SettingsPageProps {
  params: Promise<{ site: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) notFound();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-500">
          Gérez les informations et le branding de votre établissement.
        </p>
      </div>

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
          phone: tenant.phone,
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
    </div>
  );
}
