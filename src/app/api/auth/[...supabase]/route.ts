import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Strict open-redirect prevention: only allow relative paths that start with
  // a single forward slash and contain no protocol-relative bypasses (// \\ %2f etc.)
  const rawNext = searchParams.get('next') ?? '/';
  const decoded = decodeURIComponent(rawNext);
  const isSafe =
    decoded.startsWith('/') &&
    !decoded.startsWith('//') &&
    !decoded.includes('\\') &&
    !decoded.includes('%2f') &&
    !/^\/[^/]*:/.test(decoded); // blocks /foo:bar@evil.com
  const next = isSafe ? decoded : '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    logger.error('OAuth code exchange failed', error);
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
