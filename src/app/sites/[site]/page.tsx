import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import CategoryNav from '@/components/tenant/CategoryNav';
import MenuItemCard from '@/components/tenant/MenuItemCard';
import CartSummary from '@/components/tenant/CartSummary';

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

export default async function MenuPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site } = await params;
  const headersList = await headers();
  // Use header if available (from middleware), otherwise use route params
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  if (!tenantSlug) {
    return notFound();
  }

  const supabase = await createClient();

  // 1. Récupérer le tenant
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
            <h1 className="text-2xl font-bold text-gray-900 capitalize">
              {tenantSlug}
            </h1>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12 bg-white rounded-lg shadow-sm">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">
              Restaurant non configuré
            </h2>
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

  // 2. Récupérer les venues (optionnel)
  const { data: venues } = await supabase
    .from('venues')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  // 3. Récupérer les catégories
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  // 4. Récupérer les menu items
  const { data: menuItems } = await supabase
    .from('menu_items')
    .select(`
      *,
      category:categories(id, name, name_en)
    `)
    .eq('tenant_id', tenant.id)
    .eq('is_available', true)
    .order('display_order', { ascending: true });

  // Grouper les items par catégorie
  const itemsByCategory = (categories || []).map((category: Category) => ({
    ...category,
    items: (menuItems || []).filter((item: MenuItem) => item.category_id === category.id)
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          {tenant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logo_url}
              alt={tenant.name}
              className="h-12 object-contain"
            />
          ) : (
            <h1
              className="text-2xl font-bold"
              style={{ color: 'var(--tenant-primary)' }}
            >
              {tenant.name}
            </h1>
          )}
        </div>
      </header>

      {/* Category Navigation */}
      {categories && categories.length > 0 && (
        <CategoryNav categories={categories} />
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 pb-32">
        {/* Venues Selector (si plusieurs) */}
        {venues && venues.length > 1 && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4">Nos espaces</h2>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {venues.map((venue: Venue) => (
                <button
                  key={venue.id}
                  className="px-4 py-2 bg-white rounded-lg shadow-sm whitespace-nowrap hover:shadow-md transition-shadow"
                >
                  {venue.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Menu Items par catégorie */}
        {itemsByCategory.length > 0 ? (
          <div className="space-y-8">
            {itemsByCategory.map((category) => (
              category.items.length > 0 && (
                <section key={category.id} id={`cat-${category.id}`}>
                  <h2 className="text-xl font-bold text-gray-900 mb-4 px-2">
                    {category.name}
                  </h2>
                  <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                    {category.items.map((item: MenuItem) => (
                      <MenuItemCard
                        key={item.id}
                        item={item}
                        restaurantId={tenant.id}
                        category={category.name}
                        accentColor={tenant.primary_color ? `text-[${tenant.primary_color}]` : 'text-amber-600'}
                      />
                    ))}
                  </div>
                </section>
              )
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg shadow-sm">
            <p className="text-gray-500">Aucun menu disponible pour le moment.</p>
          </div>
        )}
      </main>

      {/* Cart Summary (floating) */}
      <CartSummary />
    </div>
  );
}
