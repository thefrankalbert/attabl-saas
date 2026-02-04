import { TenantProvider } from '@/contexts/TenantContext'

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ site: string }>
}) {
  const { site } = await params

  // TODO: Fetch tenantId from database based on slug
  const tenantId = null // Will be fetched from Supabase later

  return (
    <TenantProvider slug={site} tenantId={tenantId}>
      <div className="min-h-screen bg-gray-50">
        {children}
      </div>
    </TenantProvider>
  )
}
