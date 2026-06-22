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

  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>['supabase'];
  try {
    ({ user, supabase } = await getAuthenticatedUser());
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
    // IDOR guard: only a member (or super_admin) of the slug's tenant may
    // revalidate that tenant's public ISR pages. Without this any authenticated
    // user could bust an arbitrary tenant's menu cache.
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!tenant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // super_admin is canonically (is_super_admin = true OR role = 'super_admin')
    // across this codebase (schema.sql, admin/tenants) - match both so a
    // role-based super_admin is not wrongly 403'd.
    const { data: membership } = await supabase
      .from('admin_users')
      .select('tenant_id, is_super_admin, role')
      .eq('user_id', user.id)
      .or(`tenant_id.eq.${tenant.id},is_super_admin.eq.true,role.eq.super_admin`)
      .limit(1)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    revalidatePath(`/sites/${slug}`);
    revalidatePath(`/sites/${slug}/menu`);
  }
  return NextResponse.json({ revalidated: true });
}
