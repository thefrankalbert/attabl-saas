import { revalidateTag } from 'next/cache';
import { CACHE_TAG_MENUS } from '@/lib/cache-tags';
import { getAuthenticatedUser, AuthError } from '@/lib/auth/get-session';
import { NextResponse } from 'next/server';
import { revalidateMenuLimiter, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { success: allowed } = await revalidateMenuLimiter.check(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Trop de requetes. Reessayez plus tard.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  try {
    await getAuthenticatedUser();
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  revalidateTag(CACHE_TAG_MENUS, 'max');
  return NextResponse.json({ revalidated: true });
}
