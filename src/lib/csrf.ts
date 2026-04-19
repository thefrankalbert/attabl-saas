import { NextResponse } from 'next/server';

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

  // Allow requests with matching origin
  if (origin) {
    const allowedOrigins = [appUrl, `https://${appDomain}`, `https://www.${appDomain}`];
    if (
      allowedOrigins.some((allowed) => origin.startsWith(allowed)) ||
      origin.endsWith(`.${appDomain}`)
    ) {
      return null; // OK
    }
  }

  // Allow requests with matching referer (fallback)
  if (referer) {
    if (referer.includes(appDomain)) {
      return null; // OK
    }
  }

  // Allow requests without origin/referer (e.g., server-to-server, mobile apps)
  // These are still protected by auth tokens
  if (!origin && !referer) {
    return null;
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
