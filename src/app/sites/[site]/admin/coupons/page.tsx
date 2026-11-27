import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import CouponsClient from '@/components/admin/CouponsClient';
import TenantNotFound from '@/components/admin/TenantNotFound';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';
import { adminPageMetadata } from '@/lib/admin-page-metadata';
import { resolveTenantTimezone } from '@/lib/timezones';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export async function generateMetadata() {
  return adminPageMetadata('sidebar', 'navCoupons');
}

export const dynamic = 'force-dynamic';

export default async function CouponsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  await requireAdminPermission(site, 'menu.edit');
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return <TenantNotFound />;
  }

  const supabase = await createClient();

  const { data: coupons } = await supabase
    .from('coupons')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false });

  const t = await getTranslations('coupons');

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Reglage coupe: tout code est refuse au panier et a la caisse (audit
          d'equipe du 2026-11-27, convive #41). Le restaurateur doit le voir ici,
          la ou il cree ses codes. */}
      {!tenant.enable_coupons && (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-lg border border-status-warning/20 bg-status-warning-bg px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-app-text">{t('disabledTitle')}</p>
            <p className="text-app-text-secondary">{t('disabledBody')}</p>
            <Link
              href={`/sites/${site}/admin/settings`}
              className="mt-1 inline-flex min-h-[44px] items-center font-medium text-app-text underline underline-offset-2"
            >
              {t('disabledLink')}
            </Link>
          </div>
        </div>
      )}
      <CouponsClient
        tenantId={tenant.id}
        initialCoupons={coupons || []}
        currency={tenant.currency || 'XAF'}
        timeZone={resolveTenantTimezone(tenant)}
      />
    </div>
  );
}
