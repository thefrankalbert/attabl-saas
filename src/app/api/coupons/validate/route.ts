import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCouponService } from '@/services/coupon.service';
import { z } from 'zod';

const validateCouponSchema = z.object({
  code: z.string().min(1, 'Code requis'),
  tenantId: z.string().min(1, 'Tenant requis'),
  subtotal: z.number().min(0, 'Le sous-total doit être positif').default(0),
});

export async function POST(request: NextRequest) {
  try {
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

    const { code, tenantId, subtotal } = parseResult.data;

    const supabase = await createClient();
    const couponService = createCouponService(supabase);
    const result = await couponService.validateCoupon(code, tenantId, subtotal);

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
