/**
 * Origin of a message received by the service worker, for its same-origin check.
 * Uses `event.origin`, and the sending client's URL when a browser leaves the
 * origin empty: refusing the logout purge there would keep the previous user's
 * pages on a shared tablet. An unreadable URL gives '' (never same-origin).
 */
export function messageOrigin(eventOrigin: string, sourceUrl: string | undefined): string {
  if (eventOrigin) return eventOrigin;
  if (!sourceUrl) return '';
  try {
    return new URL(sourceUrl).origin;
  } catch {
    return '';
  }
}
