import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { signoutLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';

// Forces a single server-side session refresh (rotating the Supabase refresh
// token exactly once) and writes the fresh auth cookies onto the response.
//
// The update banner calls this right BEFORE a full page reload. Without it, a
// hard reload on an expired access token fires a burst of parallel authenticated
// requests that each try to refresh the single-use refresh token at the same
// time; the losers see an already-used token, get signed out, and the user lands
// on /login. Refreshing once here means the reload starts with a fresh, valid
// access token, so none of those parallel requests needs to refresh - no race.
//
// Same auth-session class as /api/auth/signout, so it follows the same guards:
// origin (CSRF) check + rate limit. Scope is the caller's own session only
// (no data read/write, no enumeration, no target parameter).
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    const ip = getClientIp(request);
    const { success: allowed } = await signoutLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const supabase = await createClient();
    // getUser() validates the JWT server-side and refreshes it if expired, writing
    // the rotated cookies onto this response via the server client's cookie setter.
    await supabase.auth.getUser();

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logger.error('Refresh-session error', error);
    // Non-fatal: the client falls back to a plain reload if this fails.
    return NextResponse.json(
      { ok: false },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
