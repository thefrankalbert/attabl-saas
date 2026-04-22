/**
 * Content Security Policy nonce generation.
 * Used by the proxy/middleware to generate a per-request nonce
 * and by next.config.mjs to build the CSP header.
 */

/**
 * Build the full CSP header string with a given nonce.
 * style-src keeps 'unsafe-inline' because Tailwind v4 requires it
 * (inline styles cannot execute code, so this is acceptable).
 */
export function buildCspHeader(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const devScriptExtras = isDev ? " 'unsafe-eval'" : '';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${devScriptExtras} https://*.stripe.com https://*.sentry.io`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://*.stripe.com https://cdn.jsdelivr.net https://images.unsplash.com",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.stripe.com https://*.sentry.io",
    'frame-src https://*.stripe.com',
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}
