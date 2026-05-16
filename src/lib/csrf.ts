import { NextResponse } from 'next/server';

function parseHost(urlString: string): string | null {
  try {
    return new URL(urlString).host.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, '');
}

function isLocalhostHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
}

/**
 * Allow apex, www, and single-level tenant subdomains (e.g. radisson.attabl.com).
 * Rejects lookalike hosts such as attabl.com.evil.tld (no suffix match on ".attabl.com").
 */
export function isAllowedAppHost(host: string, appDomain: string): boolean {
  const normalizedHost = host.toLowerCase();
  const domain = normalizeDomain(appDomain);

  if (normalizedHost === domain || normalizedHost === `www.${domain}`) {
    return true;
  }

  const suffix = `.${domain}`;
  if (!normalizedHost.endsWith(suffix)) {
    return false;
  }

  const subdomain = normalizedHost.slice(0, -suffix.length);
  return subdomain.length > 0 && !subdomain.includes('.');
}

function isAllowedOriginUrl(origin: string, appUrl: string, appDomain: string): boolean {
  const originHost = parseHost(origin);
  if (!originHost) {
    return false;
  }

  const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  if (isDev && isLocalhostHost(originHost)) {
    return true;
  }

  const appHost = parseHost(appUrl);
  if (appHost && originHost === appHost) {
    return true;
  }

  return isAllowedAppHost(originHost, appDomain);
}

function isAllowedRefererUrl(referer: string, appDomain: string): boolean {
  const refererHost = parseHost(referer);
  if (!refererHost) {
    return false;
  }

  const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  if (isDev && isLocalhostHost(refererHost)) {
    return true;
  }

  return isAllowedAppHost(refererHost, appDomain);
}

/**
 * Verify that the request originates from an allowed origin.
 * This provides basic CSRF protection for public API routes.
 * Server Actions are already protected by Next.js built-in mechanisms.
 */
export function verifyOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || 'localhost:3000';

  if (origin && isAllowedOriginUrl(origin, appUrl, appDomain)) {
    return null;
  }

  if (referer && isAllowedRefererUrl(referer, appDomain)) {
    return null;
  }

  // Unit tests do not send browser Origin/Referer headers.
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
