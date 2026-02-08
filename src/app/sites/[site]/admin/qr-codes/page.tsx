import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { QRCodePage } from './QRCodePage';

export default async function QRCodesPage() {
  const supabase = await createClient();
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug');

  // Get tenant data
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900">QR Codes</h1>
        <p className="text-gray-500 mt-2">Tenant non trouvé</p>
      </div>
    );
  }

  // Construct menu URL
  const menuUrl =
    process.env.NODE_ENV === 'development'
      ? `http://${tenant.slug}.localhost:3000`
      : `https://${tenant.slug}.attabl.com`;

  return (
    <QRCodePage
      tenant={{
        name: tenant.name,
        slug: tenant.slug,
        logoUrl: tenant.logo_url,
        primaryColor: tenant.primary_color || '#000000',
        secondaryColor: tenant.secondary_color || '#FFFFFF',
        description: tenant.description,
      }}
      menuUrl={menuUrl}
    />
  );
}
