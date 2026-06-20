import type { Metadata, Viewport } from 'next';
import { getCachedTenant } from '@/lib/cache';
import { isReservedSiteSlug } from '@/lib/tenant-slugs';
import { redirectFromReservedSiteSlug } from '@/lib/tenant-routing';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ site: string }>;
}): Promise<Metadata> {
  const { site } = await params;
  return {
    // Per-tenant PWA manifest (name, icon, splash start_url). Without this link the
    // tenant pages would fall back to the root static /manifest.json.
    manifest: `/sites/${site}/manifest.webmanifest`,
    other: {
      'mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-status-bar-style': 'black-translucent',
    },
  };
}

/**
 * Shared parent for every `[site]` route. Intentionally thin: it only resolves
 * the tenant for the reserved-slug guard and renders children. The convive
 * (storefront) chrome lives in `(storefront)/layout.tsx`; the admin dashboard
 * brings its own shell under `admin/layout.tsx`. Keeping this layout free of
 * visual chrome is what prevents the storefront UI from leaking into admin.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ site: string }>;
}) {
  const { site } = await params;

  const tenant = await getCachedTenant(site);
  if (!tenant && isReservedSiteSlug(site)) {
    await redirectFromReservedSiteSlug();
  }

  return <>{children}</>;
}
