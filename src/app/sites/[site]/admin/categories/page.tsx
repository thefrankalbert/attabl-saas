import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import CategoriesClient from '@/components/admin/CategoriesClient';
import { AlertCircle } from 'lucide-react';
import type { Category, Menu } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getTenant(tenantSlug);

  if (!tenant) {
    return (
      <div className="p-8">
        <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-yellow-600">Tenant non trouvé</p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();

  const [{ data: categories }, { data: menus }] = await Promise.all([
    supabase
      .from('categories')
      .select('*, menu_items(id)')
      .eq('tenant_id', tenant.id)
      .order('display_order', { ascending: true }),
    supabase
      .from('menus')
      .select('id, name')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ]);

  const formatted = (categories || []).map(
    (cat: Record<string, unknown>) =>
      ({
        ...cat,
        items_count: (cat.menu_items as unknown[])?.length || 0,
      }) as Category & { items_count: number },
  );

  return (
    <div className="max-w-7xl mx-auto">
      <CategoriesClient
        tenantId={tenant.id}
        initialCategories={formatted}
        menus={(menus || []) as Pick<Menu, 'id' | 'name'>[]}
      />
    </div>
  );
}
