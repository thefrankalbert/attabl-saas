import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { getCachedTenant } from '@/lib/cache';
import ItemsClient from '@/components/admin/ItemsClient';
import { AlertCircle } from 'lucide-react';
import type { MenuItem, Category, CurrencyCode } from '@/types/admin.types';

export const revalidate = 60;

export default async function ItemsPage({ params }: { params: Promise<{ site: string }> }) {
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
  const [itemsRes, categoriesRes] = await Promise.all([
    supabase
      .from('menu_items')
      .select('*, categories(id, name)')
      .eq('tenant_id', tenant.id)
      .order('name'),
    supabase.from('categories').select('*').eq('tenant_id', tenant.id).order('display_order'),
  ]);

  const items: MenuItem[] = (itemsRes.data || []).map((item: Record<string, unknown>) => ({
    ...item,
    category: item.categories as Category,
  })) as MenuItem[];

  const currency = (tenant.currency as CurrencyCode) || 'XAF';

  return (
    <div className="max-w-7xl mx-auto">
      <ItemsClient
        tenantId={tenant.id}
        initialItems={items}
        initialCategories={(categoriesRes.data || []) as Category[]}
        currency={currency}
        supportedCurrencies={[currency]}
      />
    </div>
  );
}
