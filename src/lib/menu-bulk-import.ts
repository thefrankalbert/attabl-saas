import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

const BULK_INSERT_CHUNK = 50;
const UPDATE_CONCURRENCY = 10;

export interface MenuBulkImportRow {
  rowKey: number;
  category: string;
  categoryEn?: string | null;
  name: string;
  nameEn?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
  price: number;
  /** null = non renseigne: defaut a la creation, valeur actuelle gardee a la mise a jour. */
  isAvailable: boolean | null;
  isFeatured: boolean | null;
}

export interface MenuBulkImportResult {
  categoriesCreated: number;
  categoriesExisting: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  errors: Array<{ key: number; message: string }>;
}

export interface MenuBulkImportOptions {
  /** Nombre de NOUVEAUX plats autorises par le forfait. Absent = pas de limite. */
  maxNewItems?: number;
}

type CategoryGroup = {
  categoryEn: string | null;
  items: MenuBulkImportRow[];
};

/** Cle d'identite d'un plat: meme categorie + meme nom (casse et espaces ignores). */
function itemKey(categoryId: string, name: string): string {
  return `${categoryId}|${name.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

/**
 * Bulk menu import, used by the Excel and PDF import services.
 *
 * Un plat deja present dans la carte (meme categorie, meme nom) est MIS A JOUR
 * au lieu d'etre cree une deuxieme fois: recharger son fichier corrige les
 * fiches au lieu de dupliquer toute la carte. Les champs optionnels laisses vides
 * dans le fichier ne remplacent pas la valeur existante.
 *
 * Seules les colonnes reelles de `menu_items` sont ecrites. Une colonne inconnue
 * fait refuser le lot entier par PostgREST (PGRST204): c'est ce qui bloquait
 * tout import avec `slug` et `display_order`, absentes de la table.
 */
export async function bulkImportMenuRows(
  supabase: SupabaseClient,
  tenantId: string,
  menuId: string,
  grouped: Map<string, CategoryGroup>,
  options: MenuBulkImportOptions = {},
): Promise<MenuBulkImportResult> {
  const result: MenuBulkImportResult = {
    categoriesCreated: 0,
    categoriesExisting: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: 0,
    errors: [],
  };

  if (grouped.size === 0) {
    return result;
  }

  const skip = (key: number, message: string) => {
    result.errors.push({ key, message });
    result.itemsSkipped += 1;
  };

  const { data: existingCategories, error: catListError } = await supabase
    .from('categories')
    .select('id, name, display_order')
    .eq('tenant_id', tenantId)
    .eq('menu_id', menuId);

  if (catListError) {
    logger.error('Bulk import: failed to list categories', catListError, { tenantId, menuId });
    throw catListError;
  }

  const categoryByName = new Map<string, string>();
  let nextCategoryOrder = 0;
  for (const cat of existingCategories ?? []) {
    categoryByName.set(cat.name, cat.id);
    nextCategoryOrder = Math.max(nextCategoryOrder, (cat.display_order ?? 0) + 1);
  }

  const categoriesToCreate: Array<{
    tenant_id: string;
    menu_id: string;
    name: string;
    name_en: string | null;
    display_order: number;
    is_active: boolean;
  }> = [];

  const createMeta = new Map<string, { categoryEn: string | null; items: MenuBulkImportRow[] }>();

  for (const [categoryName, group] of grouped) {
    if (categoryByName.has(categoryName)) {
      result.categoriesExisting += 1;
      continue;
    }
    const order = nextCategoryOrder;
    nextCategoryOrder += 1;
    categoriesToCreate.push({
      tenant_id: tenantId,
      menu_id: menuId,
      name: categoryName,
      name_en: group.categoryEn || null,
      display_order: order,
      is_active: true,
    });
    createMeta.set(categoryName, group);
  }

  if (categoriesToCreate.length > 0) {
    const { data: createdCats, error: createCatError } = await supabase
      .from('categories')
      .insert(categoriesToCreate)
      .select('id, name');

    if (createCatError || !createdCats) {
      logger.error('Bulk import: failed to create categories', createCatError, { tenantId });
      for (const [, group] of createMeta) {
        for (const item of group.items) {
          skip(item.rowKey, 'Impossible de creer la categorie');
        }
      }
      return result;
    }

    for (const cat of createdCats) {
      categoryByName.set(cat.name, cat.id);
      result.categoriesCreated += 1;
    }
  }

  // Plats deja presents (non supprimes) dans les categories visees.
  const categoryIds = [...new Set(categoryByName.values())];
  const existingItemId = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: existingItems, error: listError } = await supabase
      .from('menu_items')
      .select('id, category_id, name')
      .eq('tenant_id', tenantId)
      .in('category_id', categoryIds)
      .is('deleted_at', null);

    if (listError) {
      // Sans la liste on ne peut pas distinguer creation et mise a jour: creer
      // a l'aveugle dupliquerait la carte. On arrete proprement.
      logger.error('Bulk import: failed to list menu items', listError, { tenantId });
      throw listError;
    }
    for (const row of existingItems ?? []) {
      existingItemId.set(itemKey(row.category_id as string, row.name as string), row.id as string);
    }
  }

  const inserts: Array<{ key: number; row: Record<string, unknown> }> = [];
  const updates: Array<{ key: number; id: string; patch: Record<string, unknown> }> = [];
  const seenInFile = new Set<string>();
  let newItemsAllowed = options.maxNewItems ?? Number.POSITIVE_INFINITY;

  for (const [categoryName, group] of grouped) {
    const categoryId = categoryByName.get(categoryName);
    if (!categoryId) {
      for (const item of group.items) {
        skip(item.rowKey, `Categorie "${categoryName}" introuvable apres creation`);
      }
      continue;
    }

    for (const item of group.items) {
      const key = itemKey(categoryId, item.name);
      if (seenInFile.has(key)) {
        skip(item.rowKey, `"${item.name}" apparait deux fois dans la categorie "${categoryName}"`);
        continue;
      }
      seenInFile.add(key);

      const existingId = existingItemId.get(key);
      if (existingId) {
        const patch: Record<string, unknown> = { name: item.name, price: item.price };
        if (item.nameEn) patch.name_en = item.nameEn;
        if (item.description) patch.description = item.description;
        if (item.descriptionEn) patch.description_en = item.descriptionEn;
        if (item.isAvailable != null) patch.is_available = item.isAvailable;
        if (item.isFeatured != null) patch.is_featured = item.isFeatured;
        updates.push({ key: item.rowKey, id: existingId, patch });
        continue;
      }

      if (newItemsAllowed <= 0) {
        skip(item.rowKey, 'Limite de plats de votre forfait atteinte');
        continue;
      }
      newItemsAllowed -= 1;
      inserts.push({
        key: item.rowKey,
        row: {
          tenant_id: tenantId,
          category_id: categoryId,
          name: item.name,
          name_en: item.nameEn || null,
          description: item.description || null,
          description_en: item.descriptionEn || null,
          price: item.price,
          is_available: item.isAvailable ?? true,
          is_featured: item.isFeatured ?? false,
        },
      });
    }
  }

  for (let i = 0; i < inserts.length; i += BULK_INSERT_CHUNK) {
    const batch = inserts.slice(i, i + BULK_INSERT_CHUNK);
    const { error } = await supabase.from('menu_items').insert(batch.map((b) => b.row));
    if (error) {
      logger.error('Bulk import: menu_items batch failed', error, { tenantId });
      for (const b of batch) skip(b.key, 'Enregistrement du plat impossible');
    } else {
      result.itemsCreated += batch.length;
    }
  }

  for (let i = 0; i < updates.length; i += UPDATE_CONCURRENCY) {
    const batch = updates.slice(i, i + UPDATE_CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map((u) =>
        supabase.from('menu_items').update(u.patch).eq('id', u.id).eq('tenant_id', tenantId),
      ),
    );
    outcomes.forEach(({ error }, j) => {
      if (error) {
        logger.error('Bulk import: menu_items update failed', error, { tenantId });
        skip(batch[j].key, 'Mise a jour du plat impossible');
      } else {
        result.itemsUpdated += 1;
      }
    });
  }

  logger.info('Bulk menu import completed', {
    tenantId,
    menuId,
    categoriesCreated: result.categoriesCreated,
    categoriesExisting: result.categoriesExisting,
    itemsCreated: result.itemsCreated,
    itemsUpdated: result.itemsUpdated,
    itemsSkipped: result.itemsSkipped,
    errorCount: result.errors.length,
  });

  return result;
}
