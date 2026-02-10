import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import CategoriesClient from '@/components/admin/CategoriesClient';
import { AlertCircle } from 'lucide-react';
import type { Category } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
    const supabase = await createClient();
    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug');

    const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', tenantSlug)
        .single();

    if (!tenant) {
        return (
            <div className="p-8">
                <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                    <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-yellow-700">Tenant non trouvé</p>
                </div>
            </div>
        );
    }

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
