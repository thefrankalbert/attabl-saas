/**
 * Build the storefront URL encoded in a QR code.
 *
 * When a specific menu is selected we link to /menu (which reads the ?menu=
 * param); otherwise we point at the tenant root. `table` identifies the table
 * so an order can be attached to it. Shared by the single preview and the batch
 * export so both stay in sync.
 */
export function buildQRUrl(baseUrl: string, tableName?: string, menuSlug?: string): string {
  const path = menuSlug ? '/menu' : '';
  const url = new URL(`${baseUrl}${path}`);
  if (tableName) url.searchParams.set('table', tableName);
  if (menuSlug) url.searchParams.set('menu', menuSlug);
  return url.toString();
}
