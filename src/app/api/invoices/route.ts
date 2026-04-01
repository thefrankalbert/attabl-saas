import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { checkoutLimiter, getClientIp } from '@/lib/rate-limit';
import { jsonWithCache } from '@/lib/cache-headers';

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

    // Derive tenant from authenticated user
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('tenant_id, tenants(stripe_customer_id)')
      .eq('user_id', user.id)
      .single();

    if (!adminUser?.tenant_id) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Supabase join type gap
    const tenant = adminUser.tenants as unknown as { stripe_customer_id: string | null };
    const customerId = tenant?.stripe_customer_id;

    if (!customerId) {
      // No Stripe customer yet - return empty list
      return jsonWithCache({ invoices: [] }, 'dynamic');
    }

    // Fetch invoices from Stripe
    const invoiceList = await stripe.invoices.list({
      customer: customerId,
      limit: 50,
    });

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

    return jsonWithCache({ invoices }, 'dynamic');
  } catch (error: unknown) {
    logger.error('Failed to fetch invoices', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}
