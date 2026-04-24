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

    // In development/test, allow any localhost port
    const isLocalDev =
      (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
      origin.startsWith('http://localhost:');

    if (
      isLocalDev ||
      allowedOrigins.some((allowed) => origin.startsWith(allowed)) ||
      origin.endsWith(`.${appDomain}`)
    ) {
      return null; // OK
    }
  }

  // Allow requests with matching referer (fallback)
  if (referer) {
    const isLocalReferer =
      (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
      referer.includes('localhost:');
    if (isLocalReferer || referer.includes(appDomain)) {
      return null; // OK
    }
  }

  // In test environments, allow requests without Origin/Referer (unit tests do not send browser headers).
  // Webhooks (Stripe, etc.) must NOT call verifyOrigin - they use signature verification.
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  // Reject requests missing both Origin and Referer - cannot verify source in production.
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
