import { revalidateTag } from 'next/cache';
import { CACHE_TAG_MENUS } from '@/lib/cache-tags';
import { getAuthenticatedUser, AuthError } from '@/lib/auth/get-session';
import { NextResponse } from 'next/server';

export async function POST() {
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
