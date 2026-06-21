import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category } from '@/types/admin.types';
import { toSupabaseRange } from '@/lib/pagination';

type MenuItemsFilterQuery = {
  is: (column: string, value: null) => unknown;
};

/** PostgREST embed: alias required (see menu.service.ts). */
const MENU_ITEM_CATEGORY_SELECT = 'category:categories(id, name)';

export function buildMenuItemsSelect(options: {
  withCategory?: boolean;
  withVariants?: boolean;
}): string {
  const parts = ['*'];
  if (options.withVariants) {
    parts.push('item_price_variants(*)', 'item_modifiers(*)');
  }
  if (options.withCategory) {
    parts.push(MENU_ITEM_CATEGORY_SELECT);
  }
  return parts.join(', ');
}

/**
 * Restricts menu_items queries to rows that are not soft-deleted.
 */
export function withActiveMenuItems<T extends MenuItemsFilterQuery>(query: T): T {
  return query.is('deleted_at', null) as T;
}

/**
 * Updates a menu_item scoped by id + tenant_id.
 * Retries without deleted_at filter/payload when the soft-delete column is missing.
 */
export async function updateMenuItemScoped(
  supabase: SupabaseClient,
  itemId: string,
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<{ error: unknown | null }> {
  const attempt = async (filterActive: boolean, body: Record<string, unknown>) => {
    let query = supabase.from('menu_items').update(body).eq('id', itemId).eq('tenant_id', tenantId);

    if (filterActive) {
      query = withActiveMenuItems(query);
    }

    return query;
  };

  let result = await attempt(true, payload);
  if (result.error && isMissingDeletedAtColumnError(result.error)) {
    const legacyPayload = { ...payload };
    delete legacyPayload.deleted_at;
    if (Object.keys(legacyPayload).length > 0) {
      result = await attempt(false, legacyPayload);
    }
  }

  return { error: result.error };
}

/**
 * Soft-deletes a menu item, or marks unavailable if deleted_at column is missing.
 */
export async function deleteMenuItemScoped(
  supabase: SupabaseClient,
  itemId: string,
  tenantId: string,
): Promise<{ error: unknown | null }> {
  return updateMenuItemScoped(supabase, itemId, tenantId, {
    deleted_at: new Date().toISOString(),
    is_available: false,
  });
}

export function isMissingDeletedAtColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { message?: string; details?: string; hint?: string; code?: string };
  const text = `${err.message ?? ''} ${err.details ?? ''} ${err.hint ?? ''}`.toLowerCase();
  return text.includes('deleted_at') || err.code === '42703';
}

function mapMenuItemRow(
  item: Record<string, unknown>,
  options?: { withCategory?: boolean; withVariants?: boolean },
): Record<string, unknown> {
  const category = item.category ?? item.categories;
  return {
    ...item,
    ...(options?.withVariants
      ? {
          price_variants: item.item_price_variants ?? [],
          modifiers: item.item_modifiers ?? [],
        }
      : {}),
    ...(options?.withCategory ? { category } : {}),
  };
}

export type MenuItemsListFilters = {
  categoryId?: string;
  availableOnly?: boolean;
  availableFilter?: string;
};

/**
 * Runs menu_items list query; retries without deleted_at if column is missing (pre-migration DB).
 */
export type MenuItemsListPagination = {
  page: number;
  pageSize: number;
};

export async function fetchMenuItemsList(
  supabase: SupabaseClient,
  tenantId: string,
  selectClause: string,
  filters: MenuItemsListFilters,
  mapOptions?: { withCategory?: boolean; withVariants?: boolean },
  pagination?: MenuItemsListPagination,
): Promise<{ data: Record<string, unknown>[]; error: unknown | null; total: number }> {
  const run = async (excludeDeleted: boolean) => {
    let query = supabase
      .from('menu_items')
      .select(selectClause, pagination ? { count: 'exact' } : undefined)
      .eq('tenant_id', tenantId);

    if (excludeDeleted) {
      query = withActiveMenuItems(query);
    }

    if (filters.availableOnly) {
      query = query.eq('is_available', true);
    }

    if (filters.categoryId && filters.categoryId !== 'all') {
      query = query.eq('category_id', filters.categoryId);
    }

    if (filters.availableFilter && filters.availableFilter !== 'all') {
      query = query.eq('is_available', filters.availableFilter === 'available');
    }

    if (pagination) {
      const { from, to } = toSupabaseRange(pagination.page, pagination.pageSize);
      query = query.range(from, to);
    }

    return query.order('name');
  };

  let result = await run(true);
  if (result.error && isMissingDeletedAtColumnError(result.error)) {
    result = await run(false);
  }

  if (result.error) {
    return { data: [], error: result.error, total: 0 };
  }

  const rows = ((result.data || []) as unknown as Record<string, unknown>[]).map((row) =>
    mapMenuItemRow(row, mapOptions),
  );

  return { data: rows, error: null, total: result.count ?? rows.length };
}

/** Normalize category on a menu item row from Supabase. */
export function getMenuItemCategory(item: Record<string, unknown>): Category | undefined {
  const category = item.category ?? item.categories;
  return category as Category | undefined;
}

/**
 * Fetches menu_items by id for order/POS validation.
 * Retries without deleted_at when the soft-delete migration is not applied yet.
 */
export async function fetchMenuItemsByIds(
  supabase: SupabaseClient,
  tenantId: string,
  itemIds: string[],
  selectClause: string,
): Promise<{ data: Record<string, unknown>[] | null; error: unknown | null }> {
  if (itemIds.length === 0) {
    return { data: [], error: null };
  }

  const run = (excludeDeleted: boolean) => {
    let query = supabase.from('menu_items').select(selectClause).eq('tenant_id', tenantId);

    if (excludeDeleted) {
      query = withActiveMenuItems(query);
    }

    return query.in('id', itemIds);
  };

  let result = await run(true);
  if (result.error && isMissingDeletedAtColumnError(result.error)) {
    result = await run(false);
  }

  if (result.error) {
    return { data: null, error: result.error };
  }

  const rows = ((result.data || []) as unknown as Record<string, unknown>[]).map((row) =>
    mapMenuItemRow(row),
  );

  return { data: rows, error: null };
}
