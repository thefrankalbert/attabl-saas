import { headers } from 'next/headers';
import ClientSettings from '@/components/tenant/ClientSettings';
import BottomNav from '@/components/tenant/BottomNav';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

export default async function SettingsPage({ params }: { params: Promise<{ site: string }> }) {
    const { site } = await params;
    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug') || site;

    // We need to fetch tenant mainly for BottomNav color prop if not in context, 
    // but better to rely on context or fetch just what's needed.
    // Actually BottomNav takes primaryColor as prop.
    // We can fetch it or if we trust layout context, we might need a client wrapper to pass it to BottomNav?
    // BottomNav is client component. It can use useTenant() to get primaryColor if we updated it?
    // But BottomNav currently takes props.
    // Let's fetch tenant here to pass to BottomNav, or refactor BottomNav to use context.
    // Fetching is safer for now to avoid refactoring BottomNav.

    const supabase = await createClient();
    const { data: tenant } = await supabase
        .from('tenants')
        .select('primary_color')
        .eq('slug', tenantSlug)
        .single();

    if (!tenant) return notFound();

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white sticky top-0 z-40 border-b border-gray-100">
                <div className="container mx-auto px-4 py-3 flex items-center gap-3">
                    <Link href={`/sites/${tenantSlug}`} className="p-2 -ml-2 hover:bg-gray-100 rounded-full">
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </Link>
                    <h1 className="text-lg font-bold text-gray-900">Paramètres</h1>
                </div>
            </header>

            <main className="container mx-auto px-4 py-6">
                <ClientSettings />
            </main>

            <BottomNav tenantSlug={tenantSlug} primaryColor={tenant.primary_color || '#000000'} />
        </div>
    );
}
