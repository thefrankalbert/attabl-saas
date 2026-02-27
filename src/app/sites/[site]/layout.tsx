import { TenantProvider } from '@/contexts/TenantContext';
import { CartProvider } from '@/contexts/CartContext';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { getCachedTenant } from '@/lib/cache';

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
          <div className="min-h-screen bg-gray-50">{children}</div>
        </CartProvider>
      </ThemeProvider>
    </TenantProvider>
  );
}
