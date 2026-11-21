import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Strict open-redirect prevention: only allow relative paths that start with
  // a single forward slash and contain no protocol-relative bypasses (// \\ %2f etc.)
  const rawNext = searchParams.get('next') ?? '/';
  // decodeURIComponent LEVE sur une sequence invalide (`next=%`): la route
  // repondait 500. Une valeur indecodable est simplement une valeur refusee.
  let decoded = '';
  try {
    decoded = decodeURIComponent(rawNext);
  } catch {
    decoded = '';
  }
  const isSafe =
    decoded.startsWith('/') &&
    !decoded.startsWith('//') &&
    !decoded.includes('\\') &&
    !decoded.includes('@') &&
    !decoded.includes('%') &&
    !decoded.includes('\0') &&
    !/\s/.test(decoded) &&
    !/^\/[^/]*:/.test(decoded);
  const next = isSafe ? decoded : '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    logger.error('OAuth code exchange failed', error);
  }

  // `/auth/auth-code-error` n'a jamais existe (404). Meme repli que
  // /auth/callback: la page de connexion.
  return NextResponse.redirect(`${origin}/login`);
}
