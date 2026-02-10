import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import UsersClient from '@/components/admin/UsersClient';
import { AlertCircle } from 'lucide-react';
import type { AdminUser, AdminRole } from '@/types/admin.types';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
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
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl max-w-md">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div>
                        <h3 className="text-red-700 font-bold">Tenant non trouvé</h3>
                    </div>
                </div>
            </div>
        );
    }

    // 1. Get Current User & Role
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return <div>Non autorisé</div>;
    }

    const { data: currentUserData } = await supabase
        .from('admin_users')
        .select('role')
        .eq('user_id', user.id)
        .eq('tenant_id', tenant.id)
        .single();

    if (!currentUserData) {
        return <div>Accès refusé</div>;
    }

    // 2. Fetch Users List
    const { data: users } = await supabase
        .from('admin_users')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });

    return (
        <UsersClient
            tenantId={tenant.id}
            currentUserRole={currentUserData.role as AdminRole}
            initialUsers={(users as AdminUser[]) || []}
        />
    );
}
