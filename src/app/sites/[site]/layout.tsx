import type { Metadata, Viewport } from 'next';
import { TenantProvider } from '@/contexts/TenantContext';
import { CartProvider } from '@/contexts/CartContext';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { TenantBrandProvider } from '@/components/theme/TenantBrandProvider';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { getCachedTenant } from '@/lib/cache';
import { getFontById } from '@/lib/config/fonts';
import { ClientBottomNav } from '@/components/tenant/client/BottomNav';
import { ClientFloatingCart } from '@/components/tenant/client/FloatingCart';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
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

  const tenant = await getCachedTenant(site);

  const tenantId = tenant?.id || null;

  const tenantFont = getFontById(tenant?.font_family);
  const tenantFontFamily = `var(${tenantFont.cssVariable}), 'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;

  return (
    <NextThemesProvider attribute="class" forcedTheme="light">
      <TenantProvider slug={site} tenantId={tenantId} tenant={tenant}>
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
              <div
                className="tenant-client flex h-dvh flex-col overflow-hidden bg-white antialiased"
                style={{ fontFamily: tenantFontFamily }}
              >
                <main
                  id="main-content"
                  className="relative flex-1 overflow-y-auto overscroll-contain"
                >
                  {children}
                </main>
                <ClientFloatingCart slug={site} />
                <ClientBottomNav slug={site} />
              </div>
            </CurrencyProvider>
          </CartProvider>
        </TenantBrandProvider>
      </TenantProvider>
    </NextThemesProvider>
  );
}
