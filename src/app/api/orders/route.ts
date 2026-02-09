import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { createOrderSchema } from '@/lib/validations/order.schema';
import { orderLimiter, getClientIp } from '@/lib/rate-limit';
import { createOrderService } from '@/services/order.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';

export async function POST(request: Request) {
  try {
    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await orderLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429 },
      );
    }

    const supabase = await createClient();
    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug');

    if (!tenantSlug) {
      return NextResponse.json({ error: 'Tenant non identifié' }, { status: 400 });
    }

    // 2. Parse and validate input with Zod
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const parseResult = createOrderSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        { error: 'Données de commande invalides', details: errors },
        { status: 400 },
      );
    }

    // 3. Execute order creation via service
    const orderService = createOrderService(supabase);

    const { id: tenantId } = await orderService.validateTenant(tenantSlug);

    const { items, notes, tableNumber, customerName, customerPhone } = parseResult.data;

    const { validatedTotal } = await orderService.validateOrderItems(tenantId, items);

    const result = await orderService.createOrderWithItems({
      tenantId,
      items,
      total: validatedTotal,
      tableNumber,
      customerName,
      customerPhone,
      notes,
    });

    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      total: result.total,
      message: 'Commande enregistrée avec succès !',
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message, ...(error.details ? { details: error.details } : {}) },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Order creation error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
