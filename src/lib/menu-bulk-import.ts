import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

const BULK_INSERT_CHUNK = 50;

export interface MenuBulkImportRow {
  rowKey: number;
  category: string;
  categoryEn?: string | null;
  name: string;
  nameEn?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
  price: number;
  isAvailable: boolean;
  isFeatured: boolean;
}

export interface MenuBulkImportResult {
  categoriesCreated: number;
  categoriesExisting: number;
  itemsCreated: number;
  itemsSkipped: number;
  errors: Array<{ key: number; message: string }>;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type CategoryGroup = {
  categoryEn: string | null;
  items: MenuBulkImportRow[];
};

/**
 * Bulk menu import: 2-3 DB round-trips per category group instead of per row.
 * Used by Excel and PDF import services.
 */
export async function bulkImportMenuRows(
  supabase: SupabaseClient,
  tenantId: string,
  menuId: string,
  grouped: Map<string, CategoryGroup>,
): Promise<MenuBulkImportResult> {
  const result: MenuBulkImportResult = {
    categoriesCreated: 0,
    categoriesExisting: 0,
    itemsCreated: 0,
    itemsSkipped: 0,
    errors: [],
  };

  if (grouped.size === 0) {
    return result;
  }

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
          result.errors.push({
            key: item.rowKey,
            message: 'Failed to create categories batch',
          });
          result.itemsSkipped += 1;
        }
      }
      return result;
    }

    for (const cat of createdCats) {
      categoryByName.set(cat.name, cat.id);
      result.categoriesCreated += 1;
    }
  }

  const categoryIds = [...new Set(categoryByName.values())];
  const itemCountByCategory = new Map<string, number>();

  if (categoryIds.length > 0) {
    const { data: existingItems, error: countError } = await supabase
      .from('menu_items')
      .select('category_id')
      .eq('tenant_id', tenantId)
      .in('category_id', categoryIds);

    if (countError) {
      logger.error('Bulk import: failed to count menu items', countError, { tenantId });
    } else {
      for (const row of existingItems ?? []) {
        const cid = row.category_id as string;
        itemCountByCategory.set(cid, (itemCountByCategory.get(cid) ?? 0) + 1);
      }
    }
  }

  const pendingInserts: Array<Record<string, unknown>> = [];
  const pendingKeys: number[] = [];

  const flushInserts = async () => {
    if (pendingInserts.length === 0) {
      return;
    }
    const batch = pendingInserts.splice(0, pendingInserts.length);
    const keys = pendingKeys.splice(0, pendingKeys.length);

    const { error: insertError } = await supabase.from('menu_items').insert(batch);
    if (insertError) {
      logger.error('Bulk import: menu_items batch failed', insertError, { tenantId });
      for (let i = 0; i < keys.length; i++) {
        result.errors.push({
          key: keys[i],
          message: `Failed to insert items batch: ${insertError.message}`,
        });
        result.itemsSkipped += 1;
      }
      return;
    }
    result.itemsCreated += keys.length;
  };

  for (const [categoryName, group] of grouped) {
    const categoryId = categoryByName.get(categoryName);
    if (!categoryId) {
      for (const item of group.items) {
        result.errors.push({
          key: item.rowKey,
          message: `Category "${categoryName}" not found after import`,
        });
        result.itemsSkipped += 1;
      }
      continue;
    }

    let nextItemOrder = itemCountByCategory.get(categoryId) ?? 0;

    for (const item of group.items) {
      pendingInserts.push({
        tenant_id: tenantId,
        category_id: categoryId,
        name: item.name,
        name_en: item.nameEn || null,
        description: item.description || null,
        description_en: item.descriptionEn || null,
        price: item.price,
        is_available: item.isAvailable,
        is_featured: item.isFeatured,
        slug: slugify(item.name),
        display_order: nextItemOrder,
      });
      pendingKeys.push(item.rowKey);
      nextItemOrder += 1;

      if (pendingInserts.length >= BULK_INSERT_CHUNK) {
        await flushInserts();
      }
    }

    itemCountByCategory.set(categoryId, nextItemOrder);
  }

  await flushInserts();

  logger.info('Bulk menu import completed', {
    tenantId,
    menuId,
    categoriesCreated: result.categoriesCreated,
    categoriesExisting: result.categoriesExisting,
    itemsCreated: result.itemsCreated,
    itemsSkipped: result.itemsSkipped,
    errorCount: result.errors.length,
  });

  return result;
}
