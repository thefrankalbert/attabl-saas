import { TenantProvider } from '@/contexts/TenantContext'
import { CartProvider } from '@/contexts/CartContext'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { createClient } from '@/lib/supabase/server'

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ site: string }>
}) {
  const { site } = await params

  // Fetch tenant from database
  const supabase = await createClient()
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, primary_color, secondary_color')
    .eq('slug', site)
    .single()

  const tenantId = tenant?.id || null

  return (
    <TenantProvider slug={site} tenantId={tenantId}>
      <ThemeProvider
        initialColors={{
          primaryColor: tenant?.primary_color || '#000000',
          secondaryColor: tenant?.secondary_color || '#FFFFFF',
        }}
      >
        <CartProvider>
          <div className="min-h-screen bg-gray-50">
            {children}
          </div>
        </CartProvider>
      </ThemeProvider>
    </TenantProvider>
  )
}
