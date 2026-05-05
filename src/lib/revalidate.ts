/** Fire-and-forget revalidation of the public menu ISR cache.
 *  Pass the tenant slug to also force-revalidate the ISR pages for that site. */
export function revalidateMenuCache(slug?: string) {
  fetch('/api/revalidate-menu', {
    method: 'POST',
    ...(slug
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) }
      : {}),
  }).catch(() => {});
}
