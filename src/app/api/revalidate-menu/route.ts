import { revalidateTag, revalidatePath } from 'next/cache';
import { CACHE_TAG_MENUS } from '@/lib/cache-tags';
import { getAuthenticatedUser, AuthError } from '@/lib/auth/get-session';
import { NextResponse } from 'next/server';
import { revalidateMenuLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';

export async function POST(request: Request) {
  const originErr = verifyOrigin(request);
  if (originErr) return originErr;

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

  let slug: string | undefined;
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === 'object' && 'slug' in body) {
      const s = (body as Record<string, unknown>).slug;
      if (typeof s === 'string' && s.length > 0 && s.length < 100) slug = s;
    }
  } catch {
    // body is optional
  }

  revalidateTag(CACHE_TAG_MENUS, 'max');
  if (slug) {
    revalidatePath(`/sites/${slug}`);
    revalidatePath(`/sites/${slug}/menu`);
  }
  return NextResponse.json({ revalidated: true });
}
