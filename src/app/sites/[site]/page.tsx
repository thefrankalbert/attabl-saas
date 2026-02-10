import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import ClientMenuPage from '@/components/tenant/ClientMenuPage';

// Types pour les données
interface Category {
  id: string;
  name: string;
  name_en?: string;
  display_order: number;
}

interface MenuItem {
  id: string;
  name: string;
  name_en?: string;
  description: string;
  description_en?: string;
  price: number;
  image_url?: string;
  is_vegetarian?: boolean;
  is_spicy?: boolean;
  is_available?: boolean;
  is_drink?: boolean;
  category_id: string;
  category?: Category;
}

interface Venue {
  id: string;
  name: string;
  is_active: boolean;
}

export default async function MenuPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  // Use header if available (from middleware), otherwise use route params
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  if (!tenantSlug) {
    return notFound();
  }

  const supabase = await createClient();

  // 1. Récupérer le tenant (requis avant les autres requêtes)
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', tenantSlug)
    .eq('is_active', true)
    .single();

  if (tenantError || !tenant) {
    // En mode dev, afficher un placeholder si pas de tenant
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold text-gray-900 capitalize">{tenantSlug}</h1>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12 bg-white rounded-lg shadow-sm">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Restaurant non configuré</h2>
            <p className="text-gray-500">
              Le tenant &quot;{tenantSlug}&quot; n&apos;existe pas encore dans la base de données.
            </p>
            <p className="text-sm text-gray-400 mt-4">
              Configurez Supabase et créez le tenant pour voir le menu.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ✅ OPTIMISATION: Requêtes parallèles avec Promise.all (~3x plus rapide)
  const [venuesResult, categoriesResult, menuItemsResult, adsResult] = await Promise.all([
    // Venues (optionnel)
    supabase
      .from('venues')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),

    // Catégories
    supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),

    // Menu items avec catégorie
    supabase
      .from('menu_items')
      .select(
        `
        *,
        category:categories(id, name, name_en)
      `,
      )
      .eq('tenant_id', tenant.id)
      .eq('is_available', true)
      .order('display_order', { ascending: true }),

    // Ads / Banners
    supabase
      .from('ads')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ]);

  const venues = venuesResult.data;
  const categories = categoriesResult.data;
  const menuItems = menuItemsResult.data;
  const ads = adsResult.data;

  // Grouper les items par catégorie
  const itemsByCategory = (categories || []).map((category: Category) => ({
    ...category,
    items: (menuItems || []).filter((item: MenuItem) => item.category_id === category.id),
  }));

  // Fetch zones and tables (for TablePicker)
  const [zonesResult, tablesResult] = await Promise.all([
    supabase.from('zones').select('*').eq('tenant_id', tenant.id),
    supabase.from('tables').select('*').eq('tenant_id', tenant.id)
  ]);

  const zones = zonesResult.data || [];
  const tables = tablesResult.data || [];

  return (
    <ClientMenuPage
      tenant={tenant}
      venues={venues || []}
      categories={categories || []}
      itemsByCategory={itemsByCategory}
      ads={ads || []}
      zones={zones}
      tables={tables}
    />
  );
}
