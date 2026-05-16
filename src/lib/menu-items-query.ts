type MenuItemsFilterQuery = {
  is: (column: string, value: null) => unknown;
};

/**
 * Restricts menu_items queries to rows that are not soft-deleted.
 */
export function withActiveMenuItems<T extends MenuItemsFilterQuery>(query: T): T {
  return query.is('deleted_at', null) as T;
}
