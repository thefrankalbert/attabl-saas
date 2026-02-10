import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCouponService } from '@/services/coupon.service';

export async function POST(request: NextRequest) {
  try {
    const { code, tenantId, subtotal } = await request.json();

    if (!code || !tenantId) {
      return NextResponse.json({ valid: false, error: 'Code et tenant requis' }, { status: 400 });
    }

    const supabase = await createClient();
    const couponService = createCouponService(supabase);
    const result = await couponService.validateCoupon(code, tenantId, subtotal || 0);

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
