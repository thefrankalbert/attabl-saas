import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { resolveCheckoutTenant } from '@/lib/billing/checkout-tenant';
import { buildFlutterwaveBilling } from '@/lib/billing/flutterwave/wiring';
import { checkoutLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { flutterwaveCheckoutBodySchema } from '@/lib/validations/flutterwave.schema';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';

/**
 * Lance un paiement d'abonnement par mobile money ou carte (Flutterwave).
 * Repond l'URL de la page de paiement heberge. Sans cles: 503, rien ne casse.
 */
export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    const { success: allowed } = await checkoutLimiter.check(getClientIp(request));
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
    const parsed = flutterwaveCheckoutBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Donnees invalides' },
        { status: 400 },
      );
    }

    // Le restaurant vient de la session (appartenance ACTIVE + droit `billing.manage` entier),
    // jamais du corps de la requete.
    const resolved = await resolveCheckoutTenant({
      tenantSlug: readTenantSlug(request.headers).slug,
    });
    if (!resolved.ok) {
      return NextResponse.json(
        resolved.code ? { error: resolved.error, code: resolved.code } : { error: resolved.error },
        { status: resolved.status },
      );
    }

    const result = await wired.billing.startPayment({
      tenantId: resolved.tenant.tenant_id,
      customerEmail: resolved.email,
      plan: parsed.data.plan,
      interval: parsed.data.billingInterval,
    });
    return NextResponse.json({ url: result.link });
  } catch (error: unknown) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Flutterwave checkout error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
