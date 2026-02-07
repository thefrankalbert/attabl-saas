'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateTenantSettings(tenantId: string, formData: FormData) {
    const supabase = await createClient();

    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const primaryColor = formData.get('primaryColor') as string;
    const secondaryColor = formData.get('secondaryColor') as string;
    const address = formData.get('address') as string;
    const phone = formData.get('phone') as string;
    const logoUrl = formData.get('logoUrl') as string;

    try {
        const { error } = await supabase
            .from('tenants')
            .update({
                name,
                description,
                primary_color: primaryColor,
                secondary_color: secondaryColor,
                address,
                phone,
                logo_url: logoUrl || undefined,
                updated_at: new Date().toISOString(),
            })
            .eq('id', tenantId);

        if (error) throw error;

        revalidatePath('/admin');
        revalidatePath('/admin/settings');
        revalidatePath('/', 'layout'); // Refresh client menu layout as well

        return { success: true };
    } catch (error) {
        console.error('Error updating settings:', error);
        return { success: false, error: 'Une erreur est survenue lors de la mise à jour.' };
    }
}
