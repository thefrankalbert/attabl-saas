import { TenantProvider } from '@/contexts/TenantContext';
import { CartProvider } from '@/contexts/CartContext';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { TenantBrandProvider } from '@/components/theme/TenantBrandProvider';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { getCachedTenant, toPublicTenant } from '@/lib/cache';
import { canAccessFeature } from '@/lib/plans/features';
import { isTrialLapsedForTenant } from '@/lib/billing/lapsed-trial';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import { DEFAULT_FONT } from '@/lib/config/fonts';
import { resolveStorefrontPrimary, storefrontBrandStyle } from '@/lib/utils/storefront-brand';
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
  //
  // CTR7-1: ce verrou ne lisait que `is_active`, alors qu'une suspension
  // plateforme pose AUSSI `suspended_at` - une colonne qui etait ecrite et
  // affichee dans la console, mais appliquee nulle part. Or le webhook Stripe
  // recalcule `is_active` a chaque evenement d'abonnement: un tenant suspendu
  // dont Stripe disait encore `past_due` repassait `is_active = true` et sa
  // vitrine se rallumait. L'ecriture est desormais gardee cote webhook, mais la
  // base peut DEJA porter une ligne dans cet etat: le verrou de lecture doit
  // donc tenir seul, comme il le fait maintenant pour le tableau de bord
  // (`proxy.ts`) et la prise de commande (`order-queries.ts`).
  if (tenant && (tenant.is_active === false || tenant.suspended_at)) {
    return <StorefrontUnavailable />;
  }

  // Essai expire, pas encore gele par le cron de 02:00: la prise de commande
  // (`validateTenant` -> tenantLockReason) le refuse deja en 403. Sans ce
  // verrou, le convive voyait toute la carte, remplissait son panier, puis
  // echouait a l'envoi. Meme predicat que la commande (`isTrialLapsed`), avec
  // `stripe_subscription_id` lu en service_role: la colonne est illisible pour
  // anon/authenticated. `tenant.id` vient du slug injecte par le proxy.
  if (tenant && (await isTrialLapsedForTenant(tenant.id, tenant))) {
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
            primaryColor: resolveStorefrontPrimary(tenant?.primary_color),
          }}
        >
          <CartProvider>
            <CurrencyProvider
              tenantCurrency={defaultCurrency}
              supportedCurrencies={supportedCurrencies}
            >
              <div
                className="tenant-client flex h-dvh flex-col overflow-hidden bg-white antialiased"
                style={{
                  fontFamily: tenantFontFamily,
                  ...storefrontBrandStyle(tenant?.primary_color),
                }}
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
