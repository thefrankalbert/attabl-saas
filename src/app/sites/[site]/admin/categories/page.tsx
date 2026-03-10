import { createClient } from '@/lib/supabase/server';
import { getCachedTenant } from '@/lib/cache';
import { headers } from 'next/headers';
import CategoriesClient from '@/components/admin/CategoriesClient';
import { AlertCircle } from 'lucide-react';
import type { Category } from '@/types/admin.types';

export const revalidate = 60;

export default async function CategoriesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  const tenant = await getCachedTenant(tenantSlug);

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

  const { data: categories } = await supabase
    .from('categories')
    .select('*, menu_items(id)')
    .eq('tenant_id', tenant.id)
    .order('display_order', { ascending: true });

  const formatted = (categories || []).map(
    (cat: Record<string, unknown>) =>
      ({
        ...cat,
        items_count: (cat.menu_items as unknown[])?.length || 0,
      }) as Category & { items_count: number },
  );

  return <CategoriesClient tenantId={tenant.id} initialCategories={formatted} />;
}
