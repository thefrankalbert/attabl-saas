import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { getTenantUrl } from '@/lib/constants';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { createSupportsService } from '@/services/supports.service';
import { ChevaletEditor } from '@/components/admin/supports/ChevaletEditor';
import type { TenantForEditor } from '@/types/supports.types';

export const dynamic = 'force-dynamic';

export default async function SupportsPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;
  const t = await getTranslations('sidebar.supports');

  const tenant = await getTenant(tenantSlug);
  if (!tenant) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-app-text">{t('pageTitle')}</h1>
        <p className="text-app-text-secondary mt-2">{t('tenantNotFound')}</p>
      </div>
    );
  }

  const supabase = await createClient();
  const service = createSupportsService(supabase);

  const savedConfig = await service.getConfig(tenant.id).catch(() => null);

  const tenantForEditor: TenantForEditor = {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    description: tenant.description ?? null,
    logoUrl: tenant.logo_url ?? null,
    primaryColor: tenant.primary_color ?? '#1A1A1A',
    secondaryColor: tenant.secondary_color ?? '#FFFFFF',
    menuUrl: getTenantUrl(tenant.slug),
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-app-border shrink-0">
        <h1 className="text-lg font-bold text-app-text">{t('pageTitle')}</h1>
        <p className="text-xs text-app-text-muted mt-0.5">{t('pageSubtitle')}</p>
      </div>

      {/* Editor - prend toute la hauteur restante */}
      <div className="flex-1 min-h-0">
        <ChevaletEditor tenant={tenantForEditor} savedConfig={savedConfig} />
      </div>
    </div>
  );
}
