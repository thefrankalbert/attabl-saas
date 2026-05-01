import { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';

export default async function manifest({
  params,
}: {
  params: Promise<{ site: string }>;
}): Promise<MetadataRoute.Manifest> {
  const { site } = await params;

  // Fetch tenant details
  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, logo_url, primary_color')
    .eq('slug', site)
    .single();

  const themeColor = tenant?.primary_color || '#06C167';

  return {
    name: 'ATTABL',
    short_name: 'ATTABL',
    description: 'Scannez, commandez, retrouvez vos restaurants preferes.',
    start_url: `/sites/${site}`,
    display: 'fullscreen',
    background_color: '#000000',
    theme_color: themeColor,
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
