import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { resolveCheckoutTenant } from '@/lib/billing/checkout-tenant';
import { buildFlutterwaveBilling } from '@/lib/billing/flutterwave/wiring';
import { verifyCheckoutLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { flutterwaveConfirmBodySchema } from '@/lib/validations/flutterwave.schema';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';

/**
 * Confirmation au retour de la page de paiement. Le webhook reste la voie
 * normale; celle-ci evite d'attendre quand il tarde. Meme verification, meme
 * idempotence: payer, revenir ET recevoir le webhook ne prolonge qu'une fois.
 */
export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    const { success: allowed } = await verifyCheckoutLimiter.check(getClientIp(request));
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const wired = buildFlutterwaveBilling();
    if (!wired) {
      return NextResponse.json(
        { error: 'Le paiement mobile n est pas disponible.', code: 'FLUTTERWAVE_DISABLED' },
        { status: 503 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requete invalide' }, { status: 400 });
    }
    const parsed = flutterwaveConfirmBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Donnees invalides' }, { status: 400 });
    }

    const resolved = await resolveCheckoutTenant({
      tenantSlug: readTenantSlug(request.headers).slug,
    });
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const outcome = await wired.billing.processTransaction(
      parsed.data.transactionId,
      resolved.tenant.tenant_id,
    );
    if (outcome.kind === 'rejected') {
      logger.warn('Flutterwave: confirmation refusee', {
        tenantId: resolved.tenant.tenant_id,
        reason: outcome.reason,
      });
      return NextResponse.json({ status: 'rejected' }, { status: 200 });
    }
    return NextResponse.json({
      status: outcome.kind === 'applied' ? 'applied' : 'already_applied',
    });
  } catch (error: unknown) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Flutterwave confirm error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
