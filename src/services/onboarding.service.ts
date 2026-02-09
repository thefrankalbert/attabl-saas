import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';

interface OnboardingStepData {
  establishmentType?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  tableCount?: number;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  description?: string;
}

interface MenuItem {
  name: string;
  price?: number;
  category?: string;
}

interface OnboardingCompleteData {
  establishmentType?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  tableCount?: number;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  description?: string;
  tenantSlug?: string;
  menuItems?: MenuItem[];
}

interface OnboardingState {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  step: number;
  completed: boolean;
  data: {
    establishmentType: string;
    address: string;
    city: string;
    country: string;
    phone: string;
    tableCount: number;
    logoUrl: string;
    primaryColor: string;
    secondaryColor: string;
    description: string;
  };
}

/**
 * Onboarding service — handles the multi-step onboarding flow.
 *
 * Extracted from onboarding/save, onboarding/complete, and onboarding/state routes.
 */
export function createOnboardingService(supabase: SupabaseClient) {
  return {
    /**
     * Saves progress for a specific onboarding step.
     * Updates tenant fields based on the step number.
     */
    async saveStep(tenantId: string, step: number, data: OnboardingStepData): Promise<void> {
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
      // Step 4 uses completeOnboarding()

      if (Object.keys(tenantUpdate).length > 0) {
        await supabase.from('tenants').update(tenantUpdate).eq('id', tenantId);
      }

      // Update or insert onboarding progress
      await supabase.from('onboarding_progress').upsert(
        {
          tenant_id: tenantId,
          step: step + 1, // Next step
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'tenant_id',
        },
      );
    },

    /**
     * Completes the onboarding flow:
     * 1. Updates all tenant fields
     * 2. Marks onboarding as completed
     * 3. Creates category + menu items if provided
     */
    async completeOnboarding(
      tenantId: string,
      data: OnboardingCompleteData,
    ): Promise<{ slug?: string }> {
      // 1. Final tenant update
      await supabase
        .from('tenants')
        .update({
          establishment_type: data.establishmentType,
          address: data.address,
          city: data.city,
          country: data.country,
          phone: data.phone,
          table_count: data.tableCount,
          logo_url: data.logoUrl,
          primary_color: data.primaryColor,
          secondary_color: data.secondaryColor,
          description: data.description,
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq('id', tenantId);

      // 2. Mark progress as completed
      await supabase.from('onboarding_progress').upsert(
        {
          tenant_id: tenantId,
          step: 4,
          completed: true,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'tenant_id',
        },
      );

      // 3. Create category and menu items if provided
      if (data.menuItems && data.menuItems.length > 0 && data.menuItems.some((item) => item.name)) {
        const categoryName = data.menuItems[0]?.category || 'Menu';

        const { data: category } = await supabase
          .from('categories')
          .insert({
            tenant_id: tenantId,
            name: categoryName,
            sort_order: 1,
          })
          .select()
          .single();

        if (category) {
          const validItems = data.menuItems.filter((item) => item.name && item.name.trim());

          if (validItems.length > 0) {
            await supabase.from('menu_items').insert(
              validItems.map((item) => ({
                tenant_id: tenantId,
                category_id: category.id,
                name: item.name,
                price: item.price || 0,
                is_available: true,
              })),
            );
          }
        }
      }

      return { slug: data.tenantSlug };
    },

    /**
     * Retrieves the current onboarding state for a user.
     */
    async getState(userId: string): Promise<OnboardingState> {
      // Get the user's tenant via admin_users join
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select(
          `
          tenant_id,
          tenants (
            id,
            slug,
            name,
            establishment_type,
            address,
            city,
            country,
            phone,
            table_count,
            logo_url,
            primary_color,
            secondary_color,
            description,
            onboarding_completed
          )
        `,
        )
        .eq('user_id', userId)
        .single();

      if (!adminUser || !adminUser.tenants) {
        throw new ServiceError('Tenant non trouvé', 'NOT_FOUND');
      }

      const tenant = Array.isArray(adminUser.tenants) ? adminUser.tenants[0] : adminUser.tenants;

      // Get onboarding progress
      const { data: progress } = await supabase
        .from('onboarding_progress')
        .select('*')
        .eq('tenant_id', tenant.id)
        .single();

      return {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        step: progress?.step || 1,
        completed: progress?.completed || false,
        data: {
          establishmentType: tenant.establishment_type || 'restaurant',
          address: tenant.address || '',
          city: tenant.city || '',
          country: tenant.country || 'Tchad',
          phone: tenant.phone || '',
          tableCount: tenant.table_count || 10,
          logoUrl: tenant.logo_url || '',
          primaryColor: tenant.primary_color || '#CCFF00',
          secondaryColor: tenant.secondary_color || '#000000',
          description: tenant.description || '',
        },
      };
    },
  };
}
