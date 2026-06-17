import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Per-tenant PWA manifest. Served as a route handler (Next.js only serves the
// special `manifest` file at the app root, not in nested dynamic segments).
// The tenant layout links this via metadata.manifest.
export async function GET(_request: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, logo_url, primary_color')
    .eq('slug', site)
    .single();

  const name = tenant?.name || 'Attabl Menu';
  const shortName = name.length > 12 ? name.substring(0, 12) : name;
  const themeColor = tenant?.primary_color || '#ffffff';

  return NextResponse.json(
    {
      name,
      short_name: shortName,
      description: `Menu digital pour ${name}`,
      // PWA launches on the splash/scan entry; the physical-QR deep link
      // (subdomain ?table=) still goes straight to the menu.
      start_url: `/sites/${site}/welcome`,
      display: 'fullscreen',
      background_color: '#ffffff',
      theme_color: themeColor,
      icons: [
        { src: tenant?.logo_url || '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: tenant?.logo_url || '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
}
