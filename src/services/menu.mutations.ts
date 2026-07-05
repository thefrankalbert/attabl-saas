import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateMenuInput, UpdateMenuInput } from '@/lib/validations/menu.schema';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import type { MenuRow } from './menu.service.types';

/**
 * Menu/Carte Service - write operations (create, update, delete, reorder).
 *
 * Pure mutation helpers receiving the Supabase client by injection.
 * Every method that touches a multi-tenant table filters by tenant_id.
 */

/**
 * Create a new menu (carte).
 * Generates a unique slug from the name.
 */
export async function createMenu(
  supabase: SupabaseClient,
  tenantId: string,
  input: CreateMenuInput,
): Promise<MenuRow> {
  // Generate slug via RPC
  const { data: slugData, error: slugError } = await supabase.rpc('generate_menu_slug', {
    p_tenant_id: tenantId,
    p_name: input.name,
  });

  if (slugError) {
    logger.error('Failed to generate menu slug', { error: slugError.message });
    // Fallback: generate slug client-side
    const fallbackSlug =
      input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'carte';

    const { data, error } = await supabase
      .from('menus')
      .insert({
        tenant_id: tenantId,
        name: input.name,
        name_en: input.name_en || null,
        slug: fallbackSlug + '-' + Date.now(),
        description: input.description || null,
        description_en: input.description_en || null,
        venue_id: input.venue_id || null,
        parent_menu_id: input.parent_menu_id || null,
        image_url: input.image_url || null,
        is_active: input.is_active ?? true,
        is_transversal_menu: input.is_transversal_menu ?? false,
        display_order: input.display_order ?? 0,
      })
      .select(
        'id, tenant_id, venue_id, parent_menu_id, name, name_en, slug, description, description_en, image_url, is_active, is_transversal_menu, display_order, created_at, updated_at',
      )
      .single();

    if (error) {
      throw new ServiceError('Erreur lors de la création de la carte', 'INTERNAL');
    }
    return data as MenuRow;
  }

  const slug = slugData as string;

  const { data, error } = await supabase
    .from('menus')
    .insert({
      tenant_id: tenantId,
      name: input.name,
      name_en: input.name_en || null,
      slug,
      description: input.description || null,
      description_en: input.description_en || null,
      venue_id: input.venue_id || null,
      parent_menu_id: input.parent_menu_id || null,
      image_url: input.image_url || null,
      is_active: input.is_active ?? true,
      is_transversal_menu: input.is_transversal_menu ?? false,
      display_order: input.display_order ?? 0,
    })
    .select(
      'id, tenant_id, venue_id, parent_menu_id, name, name_en, slug, description, description_en, image_url, is_active, is_transversal_menu, display_order, created_at, updated_at',
    )
    .single();

  if (error) {
    logger.error('Failed to create menu', { error: error.message });
    throw new ServiceError('Erreur lors de la création de la carte', 'INTERNAL');
  }

  return data as MenuRow;
}

/**
 * Update an existing menu.
 */
export async function updateMenu(
  supabase: SupabaseClient,
  tenantId: string,
  input: UpdateMenuInput,
): Promise<MenuRow> {
  const { id, ...updates } = input;

  // If name changed, regenerate slug
  let slug: string | undefined;
  if (updates.name) {
    const { data: slugData } = await supabase.rpc('generate_menu_slug', {
      p_tenant_id: tenantId,
      p_name: updates.name,
    });
    if (slugData) {
      slug = slugData as string;
    }
  }

  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.name_en !== undefined) payload.name_en = updates.name_en;
  if (slug) payload.slug = slug;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.description_en !== undefined) payload.description_en = updates.description_en;
  if (updates.venue_id !== undefined) payload.venue_id = updates.venue_id || null;
  if (updates.parent_menu_id !== undefined) payload.parent_menu_id = updates.parent_menu_id || null;
  if (updates.image_url !== undefined) payload.image_url = updates.image_url || null;
  if (updates.is_active !== undefined) payload.is_active = updates.is_active;
  if (updates.is_transversal_menu !== undefined)
    payload.is_transversal_menu = updates.is_transversal_menu;
  if (updates.display_order !== undefined) payload.display_order = updates.display_order;

  const { data, error } = await supabase
    .from('menus')
    .update(payload)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(
      'id, tenant_id, venue_id, parent_menu_id, name, name_en, slug, description, description_en, image_url, is_active, is_transversal_menu, display_order, created_at, updated_at',
    )
    .single();

  if (error) {
    logger.error('Failed to update menu', { error: error.message });
    throw new ServiceError('Erreur lors de la mise à jour de la carte', 'INTERNAL');
  }

  return data as MenuRow;
}

/**
 * Delete a menu. Categories cascade-delete via FK.
 */
export async function deleteMenu(
  supabase: SupabaseClient,
  menuId: string,
  tenantId: string,
): Promise<void> {
  const { error } = await supabase
    .from('menus')
    .delete()
    .eq('id', menuId)
    .eq('tenant_id', tenantId);

  if (error) {
    logger.error('Failed to delete menu', { error: error.message });
    throw new ServiceError('Erreur lors de la suppression de la carte', 'INTERNAL');
  }
}

/**
 * Reorder menus by updating display_order.
 */
export async function reorderMenus(
  supabase: SupabaseClient,
  tenantId: string,
  orderedIds: string[],
): Promise<void> {
  // N parallel UPDATEs via Promise.all - intentional trade-off for simplicity.
  // Supabase JS client has no multi-row UPDATE with varying values.
  // Acceptable because menu count is small (typically < 20) and calls are parallel.
  const updates = orderedIds.map((id, index) =>
    supabase.from('menus').update({ display_order: index }).eq('id', id).eq('tenant_id', tenantId),
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    throw new ServiceError('Erreur lors du réordonnancement', 'INTERNAL');
  }
}
