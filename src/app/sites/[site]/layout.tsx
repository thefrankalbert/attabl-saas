import { TenantProvider } from '@/contexts/TenantContext';
import { CartProvider } from '@/contexts/CartContext';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { createClient } from '@/lib/supabase/server';

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ site: string }>;
}) {
  const { site } = await params;

  // Fetch tenant from database
  const supabase = await createClient();
  const { data: tenant } = await supabase.from('tenants').select('*').eq('slug', site).single();

  const tenantId = tenant?.id || null;

  return (
    <TenantProvider slug={site} tenantId={tenantId} tenant={tenant}>
      <ThemeProvider
        initialColors={{
          primaryColor: tenant?.primary_color || '#000000',
          secondaryColor: tenant?.secondary_color || '#FFFFFF',
        }}
      >
        <LanguageProvider>
          <CartProvider>
            <div className="min-h-screen bg-gray-50">{children}</div>
          </CartProvider>
        </LanguageProvider>
      </ThemeProvider>
    </TenantProvider>
  );
}
