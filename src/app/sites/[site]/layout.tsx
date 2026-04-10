import type { Metadata, Viewport } from 'next';
import { TenantProvider } from '@/contexts/TenantContext';
import { CartProvider } from '@/contexts/CartContext';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { ThemeProvider as TenantBrandProvider } from '@/components/theme/ThemeProvider';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { getCachedTenant } from '@/lib/cache';
import { getFontById } from '@/lib/config/fonts';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ site: string }>;
}) {
  const { site } = await params;

  // Fetch tenant from cache (revalidated every 60s or on tenant-config tag)
  const tenant = await getCachedTenant(site);

  const tenantId = tenant?.id || null;

  // Resolve the tenant font (curated list - see src/lib/config/fonts.ts).
  // Falls back to Inter when the stored id is null or not in the curated list.
  const tenantFont = getFontById(tenant?.font_family);
  const tenantFontFamily = `var(${tenantFont.cssVariable}), 'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;

  return (
    <NextThemesProvider attribute="class" forcedTheme="light">
      <TenantProvider slug={site} tenantId={tenantId} tenant={tenant}>
        <TenantBrandProvider
          initialColors={{
            // Tenant can customize ONLY the primary (brand) color per 2025/2026
            // market research. Secondary/text stays locked to #1A1A1A.
            primaryColor: tenant?.primary_color || '#06C167',
            secondaryColor: '#1A1A1A',
          }}
        >
          <CartProvider>
            <CurrencyProvider
              tenantCurrency={tenant?.currency || 'XAF'}
              supportedCurrencies={
                (tenant?.supported_currencies as string[]) || [tenant?.currency || 'XAF']
              }
            >
              <div
                className="tenant-client h-full overflow-y-auto"
                style={{ fontFamily: tenantFontFamily }}
              >
                {children}
              </div>
            </CurrencyProvider>
          </CartProvider>
        </TenantBrandProvider>
      </TenantProvider>
    </NextThemesProvider>
  );
}
