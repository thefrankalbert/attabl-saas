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
      // Icones ATTABL toujours presentes (192, 512, maskable): sans elles, un
      // restaurant sans logo n'annoncait qu'une icone de 48 px et la vitrine
      // n'etait pas installable sur Android (audit d'equipe du 2026-11-27,
      // convive C29). Le logo du restaurant passe en tete, sans taille ni type
      // inventes: on ne connait ni ses dimensions ni son format.
      icons: [
        ...(tenant?.logo_url ? [{ src: tenant.logo_url, sizes: 'any', purpose: 'any' }] : []),
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        {
          src: '/icons/icon-512-maskable.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    { headers: { 'Content-Type': 'application/manifest+json' } },
  );
}
