// Auto-recovery for stale JS chunks after a deploy.
//
// When a new build ships, a browser tab (or PWA cache) still holds the old HTML
// which references JS chunk filenames the new deployment no longer serves. The
// next client-side navigation (e.g. clicking a dashboard notification -> pushing
// to /admin/orders) then fails to fetch that chunk and Next renders its error
// boundary - the user sees a "500" page even though the server is healthy.
//
// The fix: when an error boundary catches a chunk-load failure, reload the page
// once so the browser fetches the current HTML + chunk manifest. A short
// sessionStorage cooldown prevents an infinite reload loop if the chunk is
// genuinely missing (not just stale).

const RELOAD_COOLDOWN_MS = 15_000;
const RELOAD_KEY = 'attabl_chunk_reload_at';

const CHUNK_ERROR_RE =
  /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

/** True when the error looks like a stale/failed dynamic chunk load. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { name?: unknown; message?: unknown };
  if (err.name === 'ChunkLoadError') return true;
  const message = typeof err.message === 'string' ? err.message : '';
  const name = typeof err.name === 'string' ? err.name : '';
  return CHUNK_ERROR_RE.test(message) || CHUNK_ERROR_RE.test(name);
}

/**
 * If `error` is a chunk-load failure, reload the page once (rate-limited) and
 * return true so the caller can skip its normal error reporting/UI. Returns
 * false for everything else (and when the cooldown blocks a repeat reload).
 */
export function attemptChunkReload(error: unknown): boolean {
  if (typeof window === 'undefined') return false;
  if (!isChunkLoadError(error)) return false;

  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) {
      // Already reloaded very recently - the chunk is genuinely gone, not just
      // stale. Let the error boundary render instead of looping.
      return false;
    }
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable (private mode quota, etc.) - reload anyway,
    // the browser's own back-forward cache makes a loop unlikely here.
  }

  window.location.reload();
  return true;
}
