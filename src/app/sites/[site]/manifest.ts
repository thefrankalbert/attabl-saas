import { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';

export default async function manifest({ params }: { params: Promise<{ site: string }> }): Promise<MetadataRoute.Manifest> {
    const { site } = await params;

    // Fetch tenant details
    const supabase = await createClient();
    const { data: tenant } = await supabase
        .from('tenants')
        .select('name, logo_url, primary_color')
        .eq('slug', site)
        .single();

    const name = tenant?.name || 'Attabl Menu';
    const shortName = name.length > 12 ? name.substring(0, 12) : name;
    const themeColor = tenant?.primary_color || '#ffffff';

    return {
        name: name,
        short_name: shortName,
        description: `Menu digital pour ${name}`,
        start_url: `/sites/${site}`,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: themeColor,
        icons: [
            {
                src: tenant?.logo_url || '/icon-192.png',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: tenant?.logo_url || '/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
            },
        ],
    };
}
