type SearchParamValue = string | string[] | undefined;

/**
 * Table carried by a scanned QR url: `?table=` (what buildQRUrl writes) or the
 * legacy short `?t=`. Shared by every storefront entry a QR can open (the root
 * page and /menu) so a printed code attaches its table whichever path it uses.
 * A repeated param (`?table=A&table=B`) keeps the first value.
 */
export function resolveTableParam(params: {
  table?: SearchParamValue;
  t?: SearchParamValue;
}): string | undefined {
  const first = (value: SearchParamValue) => (Array.isArray(value) ? value[0] : value);
  return first(params.table) || first(params.t) || undefined;
}

/**
 * Keep the scanned table only if it is an ACTIVE table of the restaurant
 * (audit C-061: `?table=TAB-99` was shown and remembered for the visit).
 */
export function keepKnownTable(
  table: string | undefined,
  tables: ReadonlyArray<{ table_number: string; is_active?: boolean | null }>,
): string | undefined {
  if (!table) return undefined;
  return tables.some((t) => t.table_number === table && t.is_active !== false) ? table : undefined;
}
