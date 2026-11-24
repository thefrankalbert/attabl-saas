/**
 * Content Security Policy nonce generation.
 * Used by the proxy/middleware to generate a per-request nonce
 * and by next.config.mjs to build the CSP header.
 */

/** Route qui recoit les rapports de violation (src/app/api/csp-report/route.ts). */
const CSP_REPORT_PATH = '/api/csp-report';

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
    // 'wasm-unsafe-eval': autorise SEULEMENT la compilation WebAssembly (le
    // decodeur du scanner QR, cf QRScanner.tsx), pas eval() ni new Function().
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'${devScriptExtras} https://*.stripe.com https://*.sentry.io https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://*.stripe.com https://cdn.jsdelivr.net",
    "font-src 'self'",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.stripe.com https://*.sentry.io${devConnectExtras}`,
    'frame-src https://*.stripe.com https://challenges.cloudflare.com',
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    // No fallback to default-src for this one: without it any site could frame
    // the app (clickjacking). X-Frame-Options DENY says the same for older
    // browsers. Found by the OWASP ZAP scan of 2026-11-20 (rule 10055).
    "frame-ancestors 'none'",
    // Remontee des violations (audit K3.16) vers /api/csp-report, sur l'origine
    // de la page (sous-domaine de restaurant compris: les routes /api/ y sont
    // servies). `report-to` exigerait l'en-tete `Reporting-Endpoints`, pose par
    // src/proxy.ts ou next.config.mjs, deux fichiers proteges: non ajoute.
    `report-uri ${CSP_REPORT_PATH}`,
  ];
  // upgrade-insecure-requests would rewrite the dev http://127.0.0.1 calls to
  // https and rebreak them, so it is production-only.
  if (!isDev) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}
