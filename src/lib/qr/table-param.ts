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
