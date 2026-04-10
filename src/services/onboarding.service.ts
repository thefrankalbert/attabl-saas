import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import { createTableConfigService } from './table-config.service';
import { logger } from '@/lib/logger';

interface TableZoneData {
  name: string;
  prefix: string;
  tableCount: number;
  defaultCapacity?: number;
}

interface OnboardingStepData {
  tenantName?: string;
  establishmentType?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  tableCount?: number;
  tableConfigMode?: 'complete' | 'minimum' | 'skip';
  tableZones?: TableZoneData[];
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  description?: string;
}

interface MenuItem {
  name: string;
  price?: number;
  category?: string;
  imageUrl?: string;
}

interface OnboardingCompleteData {
  tenantName?: string;
  establishmentType?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  tableCount?: number;
  tableConfigMode?: 'complete' | 'minimum' | 'skip';
  tableZones?: TableZoneData[];
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  description?: string;
  currency?: string;
  language?: string;
  tenantSlug?: string;
  menuItems?: MenuItem[];
}

/**
 * Full draft data stored as JSONB in onboarding_progress.draft.
 * Mirrors the client-side OnboardingData interface so ALL fields are persisted.
 */
interface OnboardingDraft {
  // Establishment
  establishmentType?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  tableCount?: number;
  language?: string;
  currency?: string;
  // Type-specific
  starRating?: number;
  hasRestaurant?: boolean;
  hasTerrace?: boolean;
  hasWifi?: boolean;
  registerCount?: number;
  hasDelivery?: boolean;
  totalCapacity?: number;
  // Tables
  tableConfigMode?: string;
  tableZones?: TableZoneData[];
  // Branding
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  description?: string;
  // Menu
  menuOption?: string;
  menuItems?: MenuItem[];
  // QR
  qrTemplate?: string;
  qrStyle?: string;
  qrCta?: string;
  qrDescription?: string;
  // Tenant name (editable during onboarding)
  tenantName?: string;
}

interface OnboardingState {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  step: number;
  completed: boolean;
  data: OnboardingDraft;
}

/**
 * Onboarding service - handles the multi-step onboarding flow.
 *
 * Data is persisted in two places:
 * 1. `tenants` table - key business fields (establishment_type, logo_url, etc.)
 * 2. `onboarding_progress.draft` (JSONB) - FULL onboarding state including all fields
 *    that don't have dedicated tenant columns (menu items, QR config, language, etc.)
 *
 * On restore, draft takes priority since it has the most complete snapshot.
 */
export function createOnboardingService(supabase: SupabaseClient) {
  return {
    /**
     * Saves progress for a specific onboarding step.
     * - Writes key fields to tenants table (for immediate use by other parts of the app)
     * - Writes FULL data as JSONB draft to onboarding_progress (for restoration)
     */
    async saveStep(
      tenantId: string,
      step: number,
      data: OnboardingStepData,
      fullDraft?: OnboardingDraft,
    ): Promise<void> {
      const tenantUpdate: Record<string, unknown> = {};

      if (step === 1) {
        if (data.tenantName) {
          tenantUpdate.name = data.tenantName;
        }
        tenantUpdate.establishment_type = data.establishmentType;
        tenantUpdate.address = data.address;
        tenantUpdate.city = data.city;
        tenantUpdate.country = data.country;
        tenantUpdate.phone = data.phone;
        tenantUpdate.table_count = data.tableCount;
      }
      // Step 2 (tables) is stored in draft, not tenant fields
      else if (step === 3) {
        tenantUpdate.logo_url = data.logoUrl;
        tenantUpdate.primary_color = data.primaryColor;
        tenantUpdate.secondary_color = data.secondaryColor;
        tenantUpdate.description = data.description;
      }
      // Step 4 (menu) is stored in draft
      // Step 5 uses completeOnboarding()

      if (Object.keys(tenantUpdate).length > 0) {
        const { error } = await supabase.from('tenants').update(tenantUpdate).eq('id', tenantId);
        if (error) {
          logger.error('Failed to update tenant during onboarding save', error);
          throw new ServiceError('Failed to update tenant', 'INTERNAL');
        }
      }

      // Update or insert onboarding progress WITH full draft
      const progressData: Record<string, unknown> = {
        tenant_id: tenantId,
        step: step,
        updated_at: new Date().toISOString(),
      };

      // Store full draft if provided
      if (fullDraft) {
        progressData.draft = fullDraft;
      }

      const { error: progressError } = await supabase
        .from('onboarding_progress')
        .upsert(progressData, { onConflict: 'tenant_id' });

      if (progressError) {
        // Non-blocking: log but don't throw. The tenant update already succeeded.
        logger.error('Failed to save onboarding draft', progressError);
      }
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
      // Idempotency guard: check if onboarding data was fully created
      const { data: existingTenant } = await supabase
        .from('tenants')
        .select('onboarding_completed, slug')
        .eq('id', tenantId)
        .single();

      if (existingTenant?.onboarding_completed) {
        // Check if menu items were actually created
        const { count: categoryCount } = await supabase
          .from('categories')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId);

        if (categoryCount && categoryCount > 0) {
          return { slug: existingTenant.slug || data.tenantSlug };
        }
        // If onboarding_completed but no categories, fall through to create them
      }

      // 1. Final tenant update + mark progress completed - in parallel
      const tenantUpdate: Record<string, unknown> = {
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
      };
      if (data.tenantName) {
        tenantUpdate.name = data.tenantName;
      }
      if (data.currency) {
        tenantUpdate.currency = data.currency;
      }
      if (data.language) {
        tenantUpdate.default_locale = data.language;
      }

      const now = new Date().toISOString();
      const [tenantResult, progressResult] = await Promise.all([
        supabase.from('tenants').update(tenantUpdate).eq('id', tenantId),
        supabase.from('onboarding_progress').upsert(
          {
            tenant_id: tenantId,
            step: 5,
            completed: true,
            completed_at: now,
            updated_at: now,
            draft: null,
          },
          { onConflict: 'tenant_id' },
        ),
      ]);

      if (tenantResult.error) throw new ServiceError('Failed to update tenant', 'INTERNAL');
      if (progressResult.error) {
        logger.error('Failed to update onboarding progress', progressResult.error);
        // Non-blocking: progress tracking failure should not block completion
      }

      // 2. Get or create venue
      const tableService = createTableConfigService(supabase);
      let venueId: string | null = null;

      const { data: existingVenue } = await supabase
        .from('venues')
        .select('id')
        .eq('tenant_id', tenantId)
        .single();

      if (existingVenue) {
        venueId = existingVenue.id;
      } else {
        const { data: newVenue } = await supabase
          .from('venues')
          .insert({ tenant_id: tenantId, name: data.tenantSlug || 'Principal' })
          .select('id')
          .single();
        venueId = newVenue?.id || null;
      }

      // 3. Create zones/tables and categories/menu items - in parallel
      const tablePromise = (async () => {
        if (!venueId) return;
        if (data.tableZones && data.tableZones.length > 0 && data.tableConfigMode !== 'skip') {
          const zonesWithDefaults = data.tableZones.map((z) => ({
            ...z,
            defaultCapacity: z.defaultCapacity ?? 2,
          }));
          await tableService.createZonesAndTables(tenantId, venueId, zonesWithDefaults);
        } else {
          const tableCount = data.tableCount || 10;
          await tableService.createDefaultConfig(tenantId, venueId, tableCount);
        }
      })();

      const menuPromise = (async () => {
        if (
          !data.menuItems ||
          data.menuItems.length === 0 ||
          !data.menuItems.some((item) => item.name)
        )
          return;

        const validItems = data.menuItems.filter((item) => item.name && item.name.trim());
        if (validItems.length === 0) return;

        // Create default menu for this tenant
        const { data: defaultMenu, error: menuError } = await supabase
          .from('menus')
          .insert({
            tenant_id: tenantId,
            name: 'Carte Principale',
            name_en: 'Main Menu',
            is_active: true,
            display_order: 1,
          })
          .select('id')
          .single();

        if (menuError) {
          logger.error('Failed to create default menu during onboarding', menuError, { tenantId });
        }

        const menuId = defaultMenu?.id || null;

        // Group items by category
        const itemsByCategory = new Map<string, MenuItem[]>();
        for (const item of validItems) {
          const catName = item.category?.trim() || 'Menu';
          const existing = itemsByCategory.get(catName) || [];
          existing.push(item);
          itemsByCategory.set(catName, existing);
        }

        // Create all categories in parallel, then their items
        let itemDisplayOrder = 1;
        await Promise.all(
          Array.from(itemsByCategory.entries()).map(
            async ([categoryName, items], categoryIndex) => {
              const { data: category, error: catError } = await supabase
                .from('categories')
                .insert({
                  tenant_id: tenantId,
                  menu_id: menuId,
                  name: categoryName,
                  is_active: true,
                  sort_order: categoryIndex + 1,
                  display_order: categoryIndex + 1,
                })
                .select()
                .single();

              if (catError || !category) {
                logger.error('Failed to create category during onboarding', catError, {
                  categoryName,
                  tenantId,
                });
                return;
              }

              const { error: itemsError } = await supabase.from('menu_items').insert(
                items.map((item) => ({
                  tenant_id: tenantId,
                  category_id: category.id,
                  name: item.name,
                  price: item.price || 0,
                  image_url: item.imageUrl || null,
                  is_available: true,
                  display_order: itemDisplayOrder++,
                })),
              );

              if (itemsError) {
                logger.error('Failed to create menu items during onboarding', itemsError, {
                  categoryName,
                  tenantId,
                });
              }
            },
          ),
        );
      })();

      await Promise.all([tablePromise, menuPromise]);

      return { slug: data.tenantSlug };
    },

    /**
     * Retrieves the current onboarding state for a user.
     * Merges tenant fields with the saved draft for maximum data recovery.
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
            currency,
            onboarding_completed
          )
        `,
        )
        .eq('user_id', userId)
        .single();

      if (!adminUser || !adminUser.tenants) {
        throw new ServiceError('Tenant non trouvé', 'NOT_FOUND');
      }

      // Guard empty array (theoretically impossible since admin_users requires
      // a tenant, but defensive coding per audit recommendation).
      if (Array.isArray(adminUser.tenants) && adminUser.tenants.length === 0) {
        throw new ServiceError('Tenant non trouvé', 'NOT_FOUND');
      }
      const tenant = Array.isArray(adminUser.tenants) ? adminUser.tenants[0] : adminUser.tenants;

      // Get onboarding progress INCLUDING the draft
      const { data: progress } = await supabase
        .from('onboarding_progress')
        .select('step, completed, draft')
        .eq('tenant_id', tenant.id)
        .single();

      // Base data from tenant table columns
      const baseData: OnboardingDraft = {
        establishmentType: tenant.establishment_type || 'restaurant',
        address: tenant.address || '',
        city: tenant.city || '',
        country: tenant.country || 'Tchad',
        phone: tenant.phone || '',
        tableCount: tenant.table_count || 10,
        currency: tenant.currency || 'XAF',
        tableConfigMode: 'skip',
        tableZones: [],
        logoUrl: tenant.logo_url || '',
        primaryColor: tenant.primary_color || '#CCFF00',
        secondaryColor: tenant.secondary_color || '#000000',
        description: tenant.description || '',
      };

      // Merge with draft data (draft takes priority for fields it contains)
      const draft = (progress?.draft as OnboardingDraft | null) || {};
      const mergedData: OnboardingDraft = {
        ...baseData,
        ...draft,
        // Ensure tenant table values win for fields that are written there directly,
        // unless the draft has a newer/different value
        logoUrl: draft.logoUrl ?? baseData.logoUrl,
        primaryColor: draft.primaryColor ?? baseData.primaryColor,
        secondaryColor: draft.secondaryColor ?? baseData.secondaryColor,
      };

      return {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: draft.tenantName || tenant.name,
        step: progress?.step || 1,
        completed: progress?.completed || false,
        data: mergedData,
      };
    },
  };
}
