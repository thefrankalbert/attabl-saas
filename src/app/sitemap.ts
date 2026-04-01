import type { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static marketing pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/features`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/restaurants`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/hotels`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/bars-cafes`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/boulangeries`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/dark-kitchens`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/food-trucks`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/quick-service`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/nouveautes`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  // Dynamic tenant menu pages
  let tenantPages: MetadataRoute.Sitemap = [];
  try {
    const supabase = createAdminClient();
    const { data: tenants } = await supabase
      .from('tenants')
      .select('slug, updated_at')
      .eq('onboarding_completed', true);

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
