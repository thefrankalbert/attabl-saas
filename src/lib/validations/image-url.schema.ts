import { z } from 'zod';

/**
 * Image addresses next/image can actually render: our own Supabase storage
 * (the only remote host allowed in next.config.mjs `images.remotePatterns`)
 * or an app-relative asset ("/..."). Any other host makes next/image THROW at
 * render time, which took down the whole POS, the items page and the client
 * menu for a single bad row. Rejecting it at the write boundary keeps such a
 * row out of the database. Mirrors `supabaseImageHostname` in next.config.mjs.
 */
function allowedStorageHost(hostname: string): boolean {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (raw) {
    try {
      return hostname === new URL(raw).hostname;
    } catch {
      // Malformed env: fall through to the same default as next.config.mjs.
    }
  }
  return hostname.endsWith('.supabase.co');
}

export function isRenderableImageUrl(value: string): boolean {
  // App asset: a plain path only. `//host` and `/\host` are protocol-relative
  // to another site once a browser normalises the backslash.
  if (value.startsWith('/')) return /^\/[A-Za-z0-9._~%/-]+$/.test(value) && !value.startsWith('//');
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      allowedStorageHost(url.hostname) &&
      url.pathname.startsWith('/storage/v1/object/public/')
    );
  } catch {
    return false;
  }
}

export const renderableImageUrlSchema = z
  .string()
  .max(2048)
  .refine(isRenderableImageUrl, { message: "L'image doit etre envoyee depuis l'application." });
