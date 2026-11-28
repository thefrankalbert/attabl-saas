import { isMfaSatisfied, MFA_REQUIRED_CODE, MFA_REQUIRED_MESSAGE } from '@/lib/auth/mfa-assurance';
import { createClient } from '@/lib/supabase/server';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { stripe } from '@/lib/stripe/server';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getTenant } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { billingPortalLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { withStripeBreaker } from '@/lib/stripe/circuit-breaker';
import { getTenantBillingIds } from '@/lib/billing/tenant-billing-ids';
import { resolveLiveMember } from '@/lib/auth/resolve-admin-permission';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 0. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await billingPortalLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429 },
      );
    }
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    if (!(await isMfaSatisfied(supabase, user))) {
      return NextResponse.json(
        { error: MFA_REQUIRED_MESSAGE, code: MFA_REQUIRED_CODE },
        { status: 403 },
      );
    }

    // Derive the tenant from the sub-domain context (x-tenant-slug, injected by
    // the proxy) - NOT an arbitrary admin_users row - so a multi-tenant owner
    // manages the billing of the restaurant they are actually viewing.
    const tenantSlug = readTenantSlug(await headers()).slug;
    if (!tenantSlug) {
      return NextResponse.json({ error: 'Tenant introuvable' }, { status: 400 });
    }
    const tenantCtx = await getTenant(tenantSlug);
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Tenant introuvable' }, { status: 404 });
    }

    // Un membre desactive garde sa session: `resolveLiveMember` l'ecarte, il
    // n'ouvre plus le portail Stripe (resiliation, carte, factures). Gerer la
    // facturation engage une depense: `billing.manage` EN ENTIER.
    const member = await resolveLiveMember(supabase, user.id, tenantCtx.id);
    if (member?.levels['billing.manage'] !== 'full') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    // Membership + droit verified above with the session client: the Stripe id
    // is now read with the service role (column not readable by `authenticated`).
    const billing = await getTenantBillingIds(tenantCtx.id);
    const customerId = billing?.stripe_customer_id;

    if (!customerId) {
      return NextResponse.json({ error: 'Pas de compte Stripe lié' }, { status: 400 });
    }

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/sites/${tenantSlug}/admin/subscription`;

    const session = await withStripeBreaker(() =>
      stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      }),
    );

    return NextResponse.json({ url: session.url });
  } catch (error) {
    logger.error('Billing portal error', error);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
