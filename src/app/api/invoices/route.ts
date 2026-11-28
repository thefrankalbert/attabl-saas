import { isMfaSatisfied, MFA_REQUIRED_CODE, MFA_REQUIRED_MESSAGE } from '@/lib/auth/mfa-assurance';
import { NextResponse } from 'next/server';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe/server';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { checkoutLimiter, getClientIp } from '@/lib/rate-limit';
import { jsonWithCache } from '@/lib/cache-headers';
import { withStripeBreaker } from '@/lib/stripe/circuit-breaker';
import { getTenantBillingIds } from '@/lib/billing/tenant-billing-ids';
import { resolveLiveMember } from '@/lib/auth/resolve-admin-permission';
import { BILLING_READ } from '@/lib/admin-roles';
import { meetsRequirement } from '@/lib/permissions';

/**
 * GET /api/invoices
 * Returns the list of Stripe invoices for the authenticated user's tenant.
 */
export async function GET(request: Request) {
  try {
    // Rate limiting (reuse checkout limiter - low-frequency billing endpoint)
    const ip = getClientIp(request);
    const { success: allowed } = await checkoutLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const supabase = await createClient();

    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!(await isMfaSatisfied(supabase, user))) {
      return NextResponse.json(
        { error: MFA_REQUIRED_MESSAGE, code: MFA_REQUIRED_CODE },
        { status: 403 },
      );
    }

    // Derive the tenant from the sub-domain context (x-tenant-slug, injected by
    // the proxy) - NOT an arbitrary admin_users row - so a multi-tenant owner
    // sees the invoices of the restaurant they are actually viewing.
    const tenantSlug = readTenantSlug(await headers()).slug;
    if (!tenantSlug) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 400 });
    }
    const tenantCtx = await getTenant(tenantSlug);
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Un membre desactive ou retire ne lit plus les factures.
    const member = await resolveLiveMember(supabase, user.id, tenantCtx.id);
    if (!member) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Meme droit que la page des factures: `billing.manage`, niveau borne
    // compris. Le gerant VOIT les factures (il ne paie pas); le proprietaire
    // peut lui retirer ce droit.
    if (!meetsRequirement(member.levels, BILLING_READ)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Membership + droit verified above with the session client: the Stripe id
    // is now read with the service role (column not readable by `authenticated`).
    const customerId = (await getTenantBillingIds(tenantCtx.id))?.stripe_customer_id;

    if (!customerId) {
      // No Stripe customer yet - return empty list
      return jsonWithCache({ invoices: [] }, 'realtime');
    }

    // Fetch invoices from Stripe
    const invoiceList = await withStripeBreaker(() =>
      stripe.invoices.list({
        customer: customerId,
        limit: 50,
      }),
    );

    const invoices = invoiceList.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amount_paid: inv.amount_paid,
      amount_due: inv.amount_due,
      currency: inv.currency,
      created: inv.created,
      period_start: inv.period_start,
      period_end: inv.period_end,
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf: inv.invoice_pdf,
    }));

    // no-store: factures per-user/tenant, URL identique par user -> pas de cache navigateur.
    return jsonWithCache({ invoices }, 'realtime');
  } catch (error: unknown) {
    logger.error('Failed to fetch invoices', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}
