import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import { SettingsForm } from '@/components/admin/settings/SettingsForm';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { redirectToLogin, redirectToUnauthorized } from '@/lib/auth/redirect-to-main';

export const dynamic = 'force-dynamic';

import { parseSettingsTab } from '@/lib/settings-tabs';

interface SettingsPageProps {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function SettingsPage({ params, searchParams }: SettingsPageProps) {
  const { site } = await params;
  const sp = await searchParams;
  const initialTab = parseSettingsTab(sp.tab);
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) notFound();

  // Auth + tenant membership guard (defense-in-depth alongside the admin layout).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirectToLogin();
  }
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (!adminUser) {
    redirectToUnauthorized();
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full max-w-7xl @xl:max-w-[90rem] @2xl:max-w-[100rem] mx-auto">
      <SettingsForm
        initialTab={initialTab}
        initialPaymentMethods={tenant.enabled_payment_methods ?? ['cash', 'card']}
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
          supported_currencies: tenant.supported_currencies,
          custom_domain: tenant.custom_domain,
          enable_tax: tenant.enable_tax,
          tax_rate: tenant.tax_rate,
          enable_service_charge: tenant.enable_service_charge,
          service_charge_rate: tenant.service_charge_rate,
          enable_coupons: tenant.enable_coupons,
          bar_display_enabled: tenant.bar_display_enabled,
          idle_timeout_minutes: tenant.idle_timeout_minutes,
          screen_lock_mode: tenant.screen_lock_mode,
          opening_hours: tenant.opening_hours,
        }}
      />
    </div>
  );
}
