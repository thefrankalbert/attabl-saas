import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createCouponService } from '@/services/coupon.service';
import { orderLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { validateCouponSchema } from '@/lib/validations/coupon.schema';
import { getTranslations } from 'next-intl/server';
import { logger } from '@/lib/logger';

// Fallback translations for API routes where locale may not be resolved
const FALLBACK_ERRORS: Record<string, string> = {
  rateLimited: 'Trop de requetes. Reessayez plus tard.',
  tenantNotIdentified: 'Tenant non identifie',
  tenantNotFound: 'Restaurant non trouve',
  invalidRequestBody: 'Corps de requete invalide',
  invalidData: 'Donnees invalides',
  validationError: 'Erreur de validation',
};

async function getT() {
  try {
    return await getTranslations('errors');
  } catch {
    return (key: string) => FALLBACK_ERRORS[key] || key;
  }
}

export async function POST(request: Request) {
  let t: (key: string) => string;
  try {
    t = await getT();
  } catch (initError) {
    logger.error('Coupon validate API: failed to initialize translations', initError);
    t = (key: string) => FALLBACK_ERRORS[key] || key;
  }
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await orderLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { valid: false, error: t('rateLimited') },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // 2. Parse body first (may contain tenantSlug fallback)
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ valid: false, error: t('invalidRequestBody') }, { status: 400 });
    }

    const parseResult = validateCouponSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message ?? t('invalidData');
      return NextResponse.json({ valid: false, error: firstError }, { status: 400 });
    }

    const { code, subtotal, tenantSlug: bodyTenantSlug } = parseResult.data;

    // 3. Resolve tenant: prefer middleware header (production subdomain routing),
    //    fall back to body tenantSlug (localhost dev without subdomain).
    //    Coupon validation is a public, read-only endpoint (no user data, just checks
    //    whether a code exists for a tenant) so trusting the client slug here is OK.
    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug') || bodyTenantSlug;

    if (!tenantSlug) {
      // Mask this internal error with a generic "invalid code" message for users
      return NextResponse.json({ valid: false, error: 'Code promo invalide' }, { status: 400 });
    }

    // Use anon server client + security-definer RPC for tenant lookup (no RLS bypass).
    // Coupon SELECT is covered by the "Public can validate active coupons" RLS policy
    // which allows read of is_active = true coupons - sufficient for customer checkout.
    const supabase = await createClient();

    const { data: tenantRows, error: tenantError } = await supabase.rpc('get_tenant_by_slug', {
      p_slug: tenantSlug,
    });
    const tenant = Array.isArray(tenantRows) ? tenantRows[0] : null;

    if (tenantError || !tenant) {
      // Same masking
      return NextResponse.json({ valid: false, error: 'Code promo invalide' }, { status: 404 });
    }

    // 4. Validate coupon using server-derived tenantId
    const couponService = createCouponService(supabase);
    const result = await couponService.validateCoupon(code, tenant.id, subtotal);

    return NextResponse.json(result);
  } catch (error: unknown) {
    // Mask internal error details from the client - log the real message
    // server-side only. Raw error.message can leak DB errors, timeouts, etc.
    logger.error('Coupon validate unexpected error', error);
    return NextResponse.json({ valid: false, error: 'Code promo invalide' }, { status: 400 });
  }
}
