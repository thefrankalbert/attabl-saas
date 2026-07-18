import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { assignmentLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import {
  orderMutationSchema,
  type OrderMutationInput,
} from '@/lib/validations/order-mutation.schema';
import { actionUpdateOrderStatus } from '@/app/actions/orders';
import { actionAssignServer, actionReleaseAssignment } from '@/app/actions/assignments';

// Single idempotent endpoint for offline-replayable order mutations (status
// change, server assignment, release). The durable outbox on a tablet POSTs
// here with a client_request_id; on reconnect it may replay the same request,
// so we dedup on that key (order_mutation_requests) to guarantee the underlying
// action - including a cancel that restocks and releases a coupon - runs exactly
// once. Thin controller: it derives the tenant server-side and delegates to the
// same server actions the online path uses.

/** Runs the mutation for a given (already tenant-derived) request. */
async function dispatch(
  tenantId: string,
  input: OrderMutationInput,
): Promise<{ success?: boolean; error?: string }> {
  switch (input.type) {
    case 'status':
      return actionUpdateOrderStatus(tenantId, input.orderId, input.status);
    case 'assign':
      return actionAssignServer(tenantId, input.tableId, input.serverId);
    case 'release':
      return actionReleaseAssignment(tenantId, input.assignmentId);
  }
}

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // Own bucket (not the order-creation 'orders' bucket): a reconnect burst of
    // queued status/assign replays must not starve the ability to take NEW
    // orders behind a single restaurant NAT IP.
    const ip = getClientIp(request);
    const { success: allowed } = await assignmentLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = orderMutationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Donnees invalides' }, { status: 400 });
    }
    const input = parsed.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

    // Derive the tenant server-side - never trust a client-supplied tenant id.
    // Primary: the middleware-injected slug (subdomain or /sites path). Fallback:
    // a Background Sync replay fired by the service worker carries no tenant
    // Referer, so on main-domain access the header is absent - derive from the
    // session instead when the user is an active member of exactly ONE tenant
    // (the common case for restaurant staff). Ambiguous membership -> 400, and
    // the outbox retries from a page context that does carry the slug.
    const tenantSlug = (await headers()).get('x-tenant-slug');
    let tenantId: string | null = null;
    if (tenantSlug) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', tenantSlug)
        .is('deleted_at', null)
        .single();
      if (!tenant) return NextResponse.json({ error: 'Tenant non trouve' }, { status: 404 });
      // Verify the caller belongs to this tenant before touching the idempotency
      // table (RLS also enforces this, but fail fast with a clear 403).
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', user.id)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .maybeSingle();
      if (!adminUser) return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
      tenantId = tenant.id;
    } else {
      const { data: memberships } = await supabase
        .from('admin_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(2);
      if (memberships?.length === 1) {
        tenantId = memberships[0].tenant_id;
      }
    }
    if (!tenantId) return NextResponse.json({ error: 'Tenant non identifie' }, { status: 400 });

    // Idempotency: claim the key first. A duplicate (replayed) request must not
    // re-run the action - but "duplicate" only dedupes as SUCCESS if the first
    // attempt actually completed (processed_at set). A concurrent in-flight
    // claim (page drain + SW background-sync racing after reconnect) gets 409
    // so the outbox keeps the entry and retries: by then the first attempt has
    // either completed (dedupe success) or failed (key deleted, replay re-runs).
    const { error: claimError } = await supabase
      .from('order_mutation_requests')
      .insert({ client_request_id: input.client_request_id, tenant_id: tenantId });
    if (claimError) {
      if (claimError.code === '23505') {
        const { data: existing } = await supabase
          .from('order_mutation_requests')
          .select('processed_at')
          .eq('client_request_id', input.client_request_id)
          .maybeSingle();
        if (existing?.processed_at) {
          return NextResponse.json({ success: true, deduped: true });
        }
        // ponytail: a claim whose owner crashed mid-request stays NULL forever
        // and keeps answering 409 until the outbox hits MAX_ATTEMPTS and
        // surfaces it to the operator - rare, bounded, visible. Add a stale-
        // claim takeover (created_at > 60s -> re-run) if it ever shows up.
        return NextResponse.json({ error: 'Requete en cours' }, { status: 409 });
      }
      logger.error('Order mutation idempotency claim failed', {
        code: claimError.code,
        tenantId,
      });
      return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
    }

    // Run the mutation. If it fails, release the key so the outbox can retry
    // (transient) or the operator can re-enter (permanent) without being blocked
    // by a key that never produced an effect.
    let result: { success?: boolean; error?: string };
    try {
      result = await dispatch(tenantId, input);
    } catch (err) {
      await supabase
        .from('order_mutation_requests')
        .delete()
        .eq('client_request_id', input.client_request_id);
      throw err;
    }

    if (result.error) {
      await supabase
        .from('order_mutation_requests')
        .delete()
        .eq('client_request_id', input.client_request_id);
      // The actions signal an UNEXPECTED internal failure with exactly these
      // sentinel messages (orders.ts: 'Erreur interne', assignments.ts:
      // 'Server error'). Those are transient -> 500 so the outbox retries.
      // Everything else is a business rejection (validation, permission,
      // ServiceError) -> 422, permanent, surfaced to the operator.
      const transient = result.error === 'Erreur interne' || result.error === 'Server error';
      return NextResponse.json({ error: result.error }, { status: transient ? 500 : 422 });
    }

    // Mark the claim as completed so a later replay of the same key dedupes as
    // success instead of answering 409 forever.
    await supabase
      .from('order_mutation_requests')
      .update({ processed_at: new Date().toISOString() })
      .eq('client_request_id', input.client_request_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Order mutation route failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
