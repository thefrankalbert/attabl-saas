import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateMenuInput, UpdateMenuInput } from '@/lib/validations/menu.schema';
import { ServiceError } from './errors';
import { logger } from '@/lib/logger';
import { assertNameAvailable } from './duplicate-name';
import type { MenuRow } from './menu.service.types';

/**
 * Menu/Carte Service - write operations (create, update, delete, reorder).
 *
 * Pure mutation helpers receiving the Supabase client by injection.
 * Every method that touches a multi-tenant table filters by tenant_id.
 */

/**
 * Audit B24 (CRITIQUE): `parent_menu_id` et `venue_id` doivent designer une
 * carte et un espace DU MEME restaurant. Une cle etrangere ignore la RLS, et la
 * vitrine charge les sous-cartes par jointure: sans ce controle, l'admin du
 * restaurant A faisait apparaitre une carte a lui dans la vitrine de B. Une
 * carte ne peut pas non plus etre son propre parent. La base porte la meme
 * garde (declencheur `menus_same_tenant_links`).
 */
async function assertMenuLinksInTenant(
  supabase: SupabaseClient,
  tenantId: string,
  links: { venue_id?: string | null; parent_menu_id?: string | null },
  menuId?: string,
): Promise<void> {
  if (links.parent_menu_id && links.parent_menu_id === menuId) {
    throw new ServiceError('Une carte ne peut pas être sa propre carte parente.', 'VALIDATION');
  }
  const checks: Array<{ table: 'menus' | 'venues'; id: string; message: string }> = [];
  if (links.parent_menu_id) {
    checks.push({
      table: 'menus',
      id: links.parent_menu_id,
      message: 'Carte parente introuvable dans ce restaurant.',
    });
  }
  if (links.venue_id) {
    checks.push({
      table: 'venues',
      id: links.venue_id,
      message: 'Espace introuvable dans ce restaurant.',
    });
  }
  for (const check of checks) {
    const { data, error } = await supabase
      .from(check.table)
      .select('id')
      .eq('id', check.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) {
      logger.error('Failed to verify menu link', { table: check.table, error: error.message });
      throw new ServiceError('Erreur lors de la vérification de la carte', 'INTERNAL');
    }
    if (!data) throw new ServiceError(check.message, 'VALIDATION');
  }
}

/**
 * Create a new menu (carte).
 * Generates a unique slug from the name.
 */
export async function createMenu(
  supabase: SupabaseClient,
  tenantId: string,
  input: CreateMenuInput,
): Promise<MenuRow> {
  await assertMenuLinksInTenant(supabase, tenantId, input);

  await assertNameAvailable(supabase, {
    table: 'menus',
    tenantId,
    name: input.name,
    message: 'Une carte porte déjà ce nom.',
  });

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
  await assertMenuLinksInTenant(supabase, tenantId, updates, id);
  if (updates.name !== undefined) {
    // Audit B33: un renommage refuse le doublon comme la creation.
    await assertNameAvailable(supabase, {
      table: 'menus',
      tenantId,
      name: updates.name,
      message: 'Une carte porte déjà ce nom.',
      excludeId: id,
    });
  }

  // The slug is fixed at creation and never follows a rename: printed QR codes
  // and shared links carry it (audit C-059, renaming broke every printed QR).
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.name_en !== undefined) payload.name_en = updates.name_en;
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
    // `.single()` sur ZERO ligne rend PGRST116. Ici cela ne veut pas dire
    // "panne" mais "cette carte n'existe pas, ou n'appartient pas a ce
    // restaurant" - le filtre porte sur `id` ET `tenant_id`. Les confondre
    // donnait un 500 et un message "erreur serveur" la ou le restaurateur
    // aurait du lire "carte introuvable". Un 500 envoie chercher une panne qui
    // n'existe pas.
    if ((error as { code?: string }).code === 'PGRST116') {
      throw new ServiceError('Carte introuvable dans ce restaurant', 'NOT_FOUND');
    }
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
  // `count: 'exact'` n'est pas un detail: un DELETE qui ne correspond a RIEN ne
  // rend AUCUNE erreur. Sans ce compte, supprimer une carte inexistante - ou
  // appartenant a un AUTRE restaurant, puisque le filtre porte aussi sur
  // `tenant_id` - repondait "succes". L'interface annoncait alors une
  // suppression qui n'avait pas eu lieu, et le restaurateur voyait sa carte
  // toujours la. Un succes mensonger coute plus cher qu'une erreur franche.
  const { error, count } = await supabase
    .from('menus')
    .delete({ count: 'exact' })
    .eq('id', menuId)
    .eq('tenant_id', tenantId);

  if (error) {
    logger.error('Failed to delete menu', { error: error.message });
    throw new ServiceError('Erreur lors de la suppression de la carte', 'INTERNAL');
  }

  if (count === 0) {
    throw new ServiceError('Carte introuvable dans ce restaurant', 'NOT_FOUND');
  }
}

/**
 * Reorder menus by updating display_order (rang = position dans la liste).
 *
 * Audit B56: une ecriture par carte en parallele laissait un ordre a moitie
 * applique quand l'une echouait, et une carte absente repondait succes. La
 * fonction SQL `reorder_menus` fait un seul UPDATE filtre par tenant et
 * l'annule si une carte manque.
 */
export async function reorderMenus(
  supabase: SupabaseClient,
  tenantId: string,
  orderedIds: string[],
): Promise<void> {
  if (orderedIds.length === 0) return;
  const { error } = await supabase.rpc('reorder_menus', {
    p_tenant_id: tenantId,
    p_ordered_ids: orderedIds,
  });
  if (error) {
    if (error.code === 'P0002') {
      throw new ServiceError(
        'Une carte a été modifiée ou supprimée entre-temps. Rechargez la page.',
        'CONFLICT',
      );
    }
    logger.error('Failed to reorder menus', { error: error.message });
    throw new ServiceError('Erreur lors du réordonnancement', 'INTERNAL');
  }
}
