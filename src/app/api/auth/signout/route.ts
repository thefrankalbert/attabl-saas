import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { signoutLimiter, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  // Rate limiting
  const ip = getClientIp(request);
  const { success: allowed } = await signoutLimiter.check(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }
  const supabase = await createClient();
  await supabase.auth.signOut();

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/login`, { status: 302 });
}
