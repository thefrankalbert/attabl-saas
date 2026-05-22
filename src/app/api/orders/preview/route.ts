import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { orderPreviewSchema } from '@/lib/validations/order.schema';
import { orderLimiter, getClientIp } from '@/lib/rate-limit';
import { createOrderService } from '@/services/order.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { verifyOrigin } from '@/lib/csrf';

const FALLBACK_ERRORS: Record<string, string> = {
  rateLimited: 'Trop de requetes. Reessayez plus tard.',
  tenantNotIdentified: 'Tenant non identifie',
  invalidRequestBody: 'Corps de requete invalide',
  invalidOrderData: 'Donnees de commande invalides',
  serverError: 'Erreur serveur',
};

export async function POST(request: Request) {
  try {
    const originError = verifyOrigin(request);
    if (originError) return originError;

    const ip = getClientIp(request);
    const { success: allowed } = await orderLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: FALLBACK_ERRORS.rateLimited },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug');
    if (!tenantSlug) {
      return NextResponse.json({ error: FALLBACK_ERRORS.tenantNotIdentified }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: FALLBACK_ERRORS.invalidRequestBody }, { status: 400 });
    }

    const parseResult = orderPreviewSchema.safeParse(body);
    if (!parseResult.success) {
      const details = parseResult.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { error: FALLBACK_ERRORS.invalidOrderData, details },
        { status: 400 },
      );
    }

    const adminSupabase = createAdminClient();
    const orderService = createOrderService(adminSupabase);
    const tenant = await orderService.validateTenant(tenantSlug);
    const preview = await orderService.previewOrderItems(tenant.id, parseResult.data.items);

    return NextResponse.json({
      valid: preview.valid,
      issues: preview.issues,
      invalidItemIds: preview.invalidItemIds,
      validatedSubtotal: preview.validatedSubtotal,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Order preview API error', error);
    return NextResponse.json({ error: FALLBACK_ERRORS.serverError }, { status: 500 });
  }
}
