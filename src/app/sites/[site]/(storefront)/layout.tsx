import { TenantProvider } from '@/contexts/TenantContext';
import { CartProvider } from '@/contexts/CartContext';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { TenantBrandProvider } from '@/components/theme/TenantBrandProvider';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { getCachedTenant, toPublicTenant } from '@/lib/cache';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import { DEFAULT_FONT } from '@/lib/config/fonts';
import { ClientBottomNav } from '@/components/tenant/client/BottomNav';
import { ClientFloatingCart } from '@/components/tenant/client/FloatingCart';
import { StorefrontOfflineIndicator } from '@/components/tenant/client/StorefrontOfflineIndicator';
import { StorefrontUnavailable } from '@/components/tenant/StorefrontUnavailable';
import { headers } from 'next/headers';

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

  // A suspended restaurant (super-admin action) must not serve the menu or take
  // orders. getCachedTenant already returns null for soft-deleted tenants (404);
  // here we additionally block the live-but-suspended case.
  if (tenant && tenant.is_active === false) {
    return <StorefrontUnavailable />;
  }

  const tenantId = tenant?.id || null;
  // Per-request CSP nonce (set on the request headers by the proxy) so
  // next-themes' inline anti-flash script is not blocked by the enforced CSP.
  const nonce = (await headers()).get('x-csp-nonce') ?? undefined;

  // Tenant custom font is not configurable from the dashboard (no write path),
  // so the client interface always uses the default curated font.
  const tenantFontFamily = `var(${DEFAULT_FONT.cssVariable}), 'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;

  // Multi-currency (letting customers view prices in EUR/USD/...) is Pro+
  // (canAccessMultiCurrency, see pricing-data.ts). On plans without it, the
  // storefront only offers the tenant's own currency, so no alternate
  // display_currency is ever sent (the order route enforces the same rule).
  const defaultCurrency = tenant?.currency || 'XAF';
  const canMultiCurrency = canAccessFeature(
    'canAccessMultiCurrency',
    tenant?.subscription_plan as SubscriptionPlan | null,
    tenant?.subscription_status as SubscriptionStatus | null,
    tenant?.trial_ends_at ?? null,
  );
  const supportedCurrencies = canMultiCurrency
    ? (tenant?.supported_currencies as string[]) || [defaultCurrency]
    : [defaultCurrency];

  return (
    <NextThemesProvider attribute="class" forcedTheme="light" nonce={nonce}>
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
              tenantCurrency={defaultCurrency}
              supportedCurrencies={supportedCurrencies}
            >
              <div
                className="tenant-client flex h-dvh flex-col overflow-hidden bg-white antialiased"
                style={{ fontFamily: tenantFontFamily }}
              >
                <StorefrontOfflineIndicator />
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
