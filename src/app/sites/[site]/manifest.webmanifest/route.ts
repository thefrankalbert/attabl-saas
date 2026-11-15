import { NextResponse } from 'next/server';
import { getCachedTenant } from '@/lib/cache';

// Per-tenant PWA manifest. Served as a route handler (Next.js only serves the
// special `manifest` file at the app root, not in nested dynamic segments).
// The tenant layout links this via metadata.manifest.
export async function GET(_request: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;

  // Cache service_role: la ligne `tenants` d'un autre restaurant n'est plus
  // lisible par un compte connecte non membre (constat T-02).
  const cached = await getCachedTenant(site);
  const tenant = cached?.is_active ? cached : null;

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
      // Use the tenant logo when set; otherwise fall back to the app favicon
      // (which exists) rather than /icon-192.png|/icon-512.png, which are not
      // shipped and 404 on every storefront load.
      icons: tenant?.logo_url
        ? [
            { src: tenant.logo_url, sizes: '192x192', type: 'image/png' },
            { src: tenant.logo_url, sizes: '512x512', type: 'image/png' },
          ]
        : [{ src: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' }],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
}
