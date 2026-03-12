/** Fire-and-forget revalidation of the public menu ISR cache. */
export function revalidateMenuCache() {
  fetch('/api/revalidate-menu', { method: 'POST' }).catch(() => {});
}
