import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createCouponService } from '@/services/coupon.service';
import { orderLimiter, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';

const validateCouponSchema = z.object({
  code: z.string().min(1, 'Code requis'),
  subtotal: z.number().min(0, 'Le sous-total doit être positif').default(0),
});

export async function POST(request: Request) {
  try {
    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await orderLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { valid: false, error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // 2. Derive tenantId from middleware header (not from client body)
    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug');

    if (!tenantSlug) {
      return NextResponse.json({ valid: false, error: 'Tenant non identifié' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ valid: false, error: 'Tenant non trouvé' }, { status: 404 });
    }

    // 3. Parse and validate input
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { valid: false, error: 'Corps de requête invalide' },
        { status: 400 },
      );
    }

    const parseResult = validateCouponSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message ?? 'Données invalides';
      return NextResponse.json({ valid: false, error: firstError }, { status: 400 });
    }

    const { code, subtotal } = parseResult.data;

    // 4. Validate coupon using server-derived tenantId
    const couponService = createCouponService(supabase);
    const result = await couponService.validateCoupon(code, tenant.id, subtotal);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur de validation';
    const statusCode =
      error instanceof Error && 'statusCode' in error
        ? (error as { statusCode: number }).statusCode
        : 400;
    return NextResponse.json({ valid: false, error: message }, { status: statusCode });
  }
}
