import type { Metadata, Viewport } from 'next';
import { TenantProvider } from '@/contexts/TenantContext';
import { CartProvider } from '@/contexts/CartContext';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { TenantBrandProvider } from '@/components/theme/TenantBrandProvider';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { getCachedTenant, toPublicTenant } from '@/lib/cache';
import { isReservedSiteSlug } from '@/lib/tenant-slugs';
import { redirectFromReservedSiteSlug } from '@/lib/tenant-routing';
import { DEFAULT_FONT } from '@/lib/config/fonts';
import { ConviveShell } from '@/components/tenant/client/ConviveShell';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ site: string }>;
}): Promise<Metadata> {
  const { site } = await params;
  return {
    // Per-tenant PWA manifest (name, icon, splash start_url). Without this link the
    // tenant pages would fall back to the root static /manifest.json.
    manifest: `/sites/${site}/manifest.webmanifest`,
    other: {
      'mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-status-bar-style': 'black-translucent',
    },
  };
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ site: string }>;
}) {
  const { site } = await params;

  const tenant = await getCachedTenant(site);

  if (!tenant && isReservedSiteSlug(site)) {
    await redirectFromReservedSiteSlug();
  }

  const tenantId = tenant?.id || null;

  // Tenant custom font is not configurable from the dashboard (no write path),
  // so the client interface always uses the default curated font.
  const tenantFontFamily = `var(${DEFAULT_FONT.cssVariable}), 'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;

  return (
    <NextThemesProvider attribute="class" forcedTheme="light">
      <TenantProvider
        slug={site}
        tenantId={tenantId}
        tenant={tenant ? toPublicTenant(tenant) : null}
      >
        <TenantBrandProvider
          initialColors={{
            primaryColor: tenant?.primary_color || '#1A1A1A',
          }}
        >
          <CartProvider>
            <CurrencyProvider
              tenantCurrency={tenant?.currency || 'XAF'}
              supportedCurrencies={
                (tenant?.supported_currencies as string[]) || [tenant?.currency || 'XAF']
              }
            >
              <ConviveShell slug={site} fontFamily={tenantFontFamily}>
                {children}
              </ConviveShell>
            </CurrencyProvider>
          </CartProvider>
        </TenantBrandProvider>
      </TenantProvider>
    </NextThemesProvider>
  );
}
