import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { step, data } = body;

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json(
                { error: 'Non authentifié' },
                { status: 401 }
            );
        }

        // Get the user's tenant
        const { data: adminUser } = await supabase
            .from('admin_users')
            .select('tenant_id')
            .eq('user_id', user.id)
            .single();

        if (!adminUser) {
            return NextResponse.json(
                { error: 'Tenant non trouvé' },
                { status: 404 }
            );
        }

        const tenantId = adminUser.tenant_id;

        // Update tenant with data based on current step
        const tenantUpdate: Record<string, unknown> = {};

        if (step === 1) {
            tenantUpdate.establishment_type = data.establishmentType;
            tenantUpdate.address = data.address;
            tenantUpdate.city = data.city;
            tenantUpdate.country = data.country;
            tenantUpdate.phone = data.phone;
            tenantUpdate.table_count = data.tableCount;
        } else if (step === 2) {
            tenantUpdate.logo_url = data.logoUrl;
            tenantUpdate.primary_color = data.primaryColor;
            tenantUpdate.secondary_color = data.secondaryColor;
            tenantUpdate.description = data.description;
        }
        // Step 3 (menu) is handled separately
        // Step 4 uses the /complete endpoint

        if (Object.keys(tenantUpdate).length > 0) {
            await supabase
                .from('tenants')
                .update(tenantUpdate)
                .eq('id', tenantId);
        }

        // Update or insert onboarding progress
        await supabase
            .from('onboarding_progress')
            .upsert({
                tenant_id: tenantId,
                step: step + 1, // Next step
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'tenant_id',
            });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Onboarding save error:', error);
        return NextResponse.json(
            { error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
