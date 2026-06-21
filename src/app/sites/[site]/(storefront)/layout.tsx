import { TenantProvider } from '@/contexts/TenantContext';
import { CartProvider } from '@/contexts/CartContext';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { TenantBrandProvider } from '@/components/theme/TenantBrandProvider';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { getCachedTenant, toPublicTenant } from '@/lib/cache';
import { DEFAULT_FONT } from '@/lib/config/fonts';
import { ClientBottomNav } from '@/components/tenant/client/BottomNav';
import { ClientFloatingCart } from '@/components/tenant/client/FloatingCart';

/**
 * Storefront (convive) shell.
 *
 * Scoped to the `(storefront)` route group so it wraps ONLY the customer-facing
 * pages (menu, cart, orders...). The admin dashboard lives at `[site]/admin`,
 * outside this group, so it no longer inherits the convive chrome
 * (bottom nav, floating cart, forced-light theme, full-height client wrapper).
 */
export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ site: string }>;
}) {
  const { site } = await params;
  const tenant = await getCachedTenant(site);
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
