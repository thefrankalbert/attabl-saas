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
  // In local dev the Supabase stack is served over http/ws on 127.0.0.1, which
  // the production connect-src (https://*.supabase.co only) would block. Allow the
  // local origin ONLY in dev. Production CSP is unchanged.
  const devConnectExtras = isDev
    ? ' http://127.0.0.1:54321 ws://127.0.0.1:54321 http://localhost:54321 ws://localhost:54321'
    : '';
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${devScriptExtras} https://*.stripe.com https://*.sentry.io https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://*.stripe.com https://cdn.jsdelivr.net",
    "font-src 'self'",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.stripe.com https://*.sentry.io https://api.exchangerate-api.com${devConnectExtras}`,
    'frame-src https://*.stripe.com https://challenges.cloudflare.com',
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  // upgrade-insecure-requests would rewrite the dev http://127.0.0.1 calls to
  // https and rebreak them, so it is production-only.
  if (!isDev) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}
