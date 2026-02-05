import { TenantProvider } from '@/contexts/TenantContext'
import { CartProvider } from '@/contexts/CartContext'
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
    .select('id')
    .eq('slug', site)
    .single()

  const tenantId = tenant?.id || null

  return (
    <TenantProvider slug={site} tenantId={tenantId}>
      <CartProvider>
        <div className="min-h-screen bg-gray-50">
          {children}
        </div>
      </CartProvider>
    </TenantProvider>
  )
}
