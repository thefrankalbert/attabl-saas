import { TenantProvider } from '@/contexts/TenantContext';
import { CartProvider } from '@/contexts/CartContext';
import { CurrencyProvider } from '@/contexts/CurrencyContext';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { getCachedTenant } from '@/lib/cache';
import { TenantLightMode } from '@/components/tenant/TenantLightMode';

// Inline script to immediately switch from dark to light theme
// Runs before React hydration to prevent dark flash
const LIGHT_MODE_SCRIPT = `
(function(){
  var d=document.documentElement;
  d.classList.remove('dark');
  d.classList.add('light');
  d.style.colorScheme='light';
  document.body.style.backgroundColor='#ffffff';
  document.body.style.color='#111111';
})();
`;

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
    <TenantProvider slug={site} tenantId={tenantId} tenant={tenant}>
      <ThemeProvider
        initialColors={{
          primaryColor: tenant?.primary_color || '#000000',
          secondaryColor: tenant?.secondary_color || '#FFFFFF',
        }}
      >
        <CartProvider>
          <CurrencyProvider
            tenantCurrency={tenant?.currency || 'XAF'}
            supportedCurrencies={tenant?.supported_currencies || [tenant?.currency || 'XAF']}
          >
            {/* Synchronous script to switch theme before paint */}
            <script dangerouslySetInnerHTML={{ __html: LIGHT_MODE_SCRIPT }} />
            <TenantLightMode>{children}</TenantLightMode>
          </CurrencyProvider>
        </CartProvider>
      </ThemeProvider>
    </TenantProvider>
  );
}
