import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError, isTenantNameConflictError } from './errors';
import { createTableConfigService } from './table-config.service';
import { logger } from '@/lib/logger';
import type { OnboardingCompleteData, MenuItem } from './onboarding.types';

/**
 * Completes the onboarding flow:
 * 1. Updates all tenant fields
 * 2. Marks onboarding as completed
 * 3. Creates category + menu items if provided
 */
export async function completeOnboarding(
  supabase: SupabaseClient,
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

  if (tenantResult.error) {
    if (isTenantNameConflictError(tenantResult.error)) {
      throw new ServiceError('RESTAURANT_NAME_TAKEN', 'CONFLICT', tenantResult.error);
    }
    throw new ServiceError('Failed to update tenant', 'INTERNAL');
  }
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
    // A tenant can have several venues; take the earliest (main) one. `.single()`
    // would throw on >1 row and silently insert a duplicate venue.
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

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
    if (!data.menuItems || data.menuItems.length === 0 || !data.menuItems.some((item) => item.name))
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
        // menus.slug is NOT NULL; the default menu needs an explicit slug or the
        // insert fails (23502) and onboarding silently creates no menu/categories.
        slug: 'carte-principale',
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

    // Create all categories in parallel, then their items.
    // Pre-compute each category's display_order start offset BEFORE the
    // parallel inserts. A shared mutable counter incremented inside the
    // Promise.all callbacks would race, producing duplicate or
    // non-deterministic display_order values across categories.
    const categoryEntries = Array.from(itemsByCategory.entries());
    let nextItemOrder = 1;
    const itemOrderStartByIndex = categoryEntries.map(([, items]) => {
      const start = nextItemOrder;
      nextItemOrder += items.length;
      return start;
    });
    await Promise.all(
      categoryEntries.map(async ([categoryName, items], categoryIndex) => {
        const { data: category, error: catError } = await supabase
          .from('categories')
          .insert({
            tenant_id: tenantId,
            menu_id: menuId,
            name: categoryName,
            is_active: true,
            // categories has no `sort_order` column (only display_order); writing
            // it raised PGRST204 and aborted category creation during onboarding.
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
          items.map((item, itemIndex) => ({
            tenant_id: tenantId,
            category_id: category.id,
            name: item.name,
            price: item.price || 0,
            image_url: item.imageUrl || null,
            is_available: true,
            display_order: itemOrderStartByIndex[categoryIndex] + itemIndex,
          })),
        );

        if (itemsError) {
          logger.error('Failed to create menu items during onboarding', itemsError, {
            categoryName,
            tenantId,
          });
        }
      }),
    );
  })();

  await Promise.all([tablePromise, menuPromise]);

  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .maybeSingle();

  return {
    slug: tenantRow?.slug ?? existingTenant?.slug ?? data.tenantSlug,
  };
}
