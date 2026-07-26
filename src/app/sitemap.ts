import type { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static marketing pages. Per-industry routes (/restaurants, /hotels, ...) now
  // 308-redirect to /solutions#ind-*, so only the canonical /solutions is listed.
  const now = new Date();
  const marketingRoutes: {
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
    priority: number;
  }[] = [
    { path: '', changeFrequency: 'weekly', priority: 1.0 },
    { path: '/pricing', changeFrequency: 'weekly', priority: 0.9 },
    { path: '/features', changeFrequency: 'weekly', priority: 0.8 },
    { path: '/solutions', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/materiel', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/support', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/nouveautes', changeFrequency: 'weekly', priority: 0.6 },
    { path: '/blog', changeFrequency: 'weekly', priority: 0.6 },
    { path: '/about', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/contact', changeFrequency: 'monthly', priority: 0.5 },
  ];
  const staticPages: MetadataRoute.Sitemap = marketingRoutes.map((r) => ({
    url: `${BASE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // Dynamic tenant menu pages
  let tenantPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createAdminClient();
    const { data: tenants } = await supabase
      .from('tenants')
      .select('slug, updated_at')
      .eq('onboarding_completed', true)
      .is('deleted_at', null);

    if (tenants) {
      tenantPages = tenants.map((tenant) => ({
        url: `${BASE_URL}/sites/${tenant.slug}`,
        lastModified: tenant.updated_at ? new Date(tenant.updated_at) : new Date(),
        changeFrequency: 'daily' as const,
        priority: 0.6,
      }));
    }
  } catch {
    // Sitemap generation should never fail - return static pages only
  }

  return [...staticPages, ...tenantPages];
}
