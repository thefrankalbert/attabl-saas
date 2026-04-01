import type { Metadata, Viewport } from 'next';
import { TenantProvider } from '@/contexts/TenantContext';
import { CartProvider } from '@/contexts/CartContext';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { ThemeProvider as TenantBrandProvider } from '@/components/theme/ThemeProvider';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { getCachedTenant } from '@/lib/cache';

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

  return (
    <NextThemesProvider attribute="class" forcedTheme="light">
      <TenantProvider slug={site} tenantId={tenantId} tenant={tenant}>
        <TenantBrandProvider
          initialColors={{
            primaryColor: tenant?.primary_color || '#000000',
            secondaryColor: tenant?.secondary_color || '#FFFFFF',
          }}
        >
          <CartProvider>
            <CurrencyProvider
              tenantCurrency={tenant?.currency || 'XAF'}
              supportedCurrencies={
                ((tenant as Record<string, unknown>)?.supported_currencies as string[]) || [
                  tenant?.currency || 'XAF',
                ]
              }
            >
              {children}
            </CurrencyProvider>
          </CartProvider>
        </TenantBrandProvider>
      </TenantProvider>
    </NextThemesProvider>
  );
}
