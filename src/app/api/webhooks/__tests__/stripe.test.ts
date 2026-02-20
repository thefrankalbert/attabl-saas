import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the route module
// ---------------------------------------------------------------------------

// Use vi.hoisted() so mock fns are available when the vi.mock factory runs (hoisted)
const { mockConstructEvent, mockSubscriptionsRetrieve } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockSubscriptionsRetrieve: vi.fn(),
}));

vi.mock('stripe', () => {
  return {
    default: class StripeMock {
      webhooks = { constructEvent: mockConstructEvent };
      subscriptions = { retrieve: mockSubscriptionsRetrieve };
    },
  };
});

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn((key: string) => (key === 'stripe-signature' ? 'sig_test' : null)),
    }),
  ),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Import after mocks are set up
import { POST } from '../../webhooks/stripe/route';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Stripe event for testing. */
function makeStripeEvent(type: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id: 'evt_test',
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

/** Build a fake Request with a text body. */
function makeRequest(body = 'raw_body'): Request {
  return new Request('https://example.com/api/webhooks/stripe', {
    method: 'POST',
    body,
  });
}

/** Configure the Supabase mock chain for a given table. */
function setupSupabaseChain(options: {
  selectResult?: { data: Record<string, unknown> | null; error: unknown };
  updateResult?: { error: unknown };
}) {
  const eqAfterUpdate = vi.fn().mockResolvedValue(options.updateResult ?? { error: null });
  const updateFn = vi.fn().mockReturnValue({ eq: eqAfterUpdate });

  const singleFn = vi.fn().mockResolvedValue(options.selectResult ?? { data: null, error: null });
  const eqAfterSelect = vi.fn().mockReturnValue({ single: singleFn });
  const selectFn = vi.fn().mockReturnValue({ eq: eqAfterSelect });

  mockFrom.mockReturnValue({
    select: selectFn,
    update: updateFn,
  });

  return { selectFn, eqAfterSelect, singleFn, updateFn, eqAfterUpdate };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Stripe Webhook — POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // mapStripeStatus (tested indirectly via customer.subscription.updated)
  // =========================================================================

  describe('mapStripeStatus (via subscription.updated)', () => {
    /**
     * Helper: fires a customer.subscription.updated event with the given
     * Stripe status and returns the status that was written to the DB.
     */
    async function getWrittenStatus(stripeStatus: string): Promise<string> {
      const chain = setupSupabaseChain({
        selectResult: { data: { id: 'tenant-1' }, error: null },
      });

      const event = makeStripeEvent('customer.subscription.updated', {
        customer: 'cus_123',
        status: stripeStatus,
        items: { data: [{ current_period_start: 1000000, current_period_end: 2000000 }] },
      });
      mockConstructEvent.mockReturnValue(event);

      await POST(makeRequest());

      const updatePayload = chain.updateFn.mock.calls[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      return updatePayload?.subscription_status as string;
    }

    it('maps "trialing" to "trial"', async () => {
      expect(await getWrittenStatus('trialing')).toBe('trial');
    });

    it('maps "active" to "active"', async () => {
      expect(await getWrittenStatus('active')).toBe('active');
    });

    it('maps "canceled" to "cancelled"', async () => {
      expect(await getWrittenStatus('canceled')).toBe('cancelled');
    });

    it('maps "past_due" to "past_due"', async () => {
      expect(await getWrittenStatus('past_due')).toBe('past_due');
    });

    it('maps "unpaid" to "past_due"', async () => {
      expect(await getWrittenStatus('unpaid')).toBe('past_due');
    });

    it('maps unknown status to "active" and logs warning', async () => {
      expect(await getWrittenStatus('some_unknown_status')).toBe('active');
      expect(logger.warn).toHaveBeenCalledWith('Unknown Stripe status, defaulting to active', {
        stripeStatus: 'some_unknown_status',
      });
    });
  });

  // =========================================================================
  // checkout.session.completed
  // =========================================================================

  describe('checkout.session.completed', () => {
    it('updates tenant with plan and billing info', async () => {
      const chain = setupSupabaseChain({});

      mockSubscriptionsRetrieve.mockResolvedValue({ status: 'active' });

      const event = makeStripeEvent('checkout.session.completed', {
        metadata: {
          tenant_id: 'tenant-abc',
          plan: 'premium',
          billing_interval: 'yearly',
        },
        customer: 'cus_456',
        subscription: 'sub_789',
      });
      mockConstructEvent.mockReturnValue(event);

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);

      const body = (await response.json()) as { received: boolean };
      expect(body.received).toBe(true);

      // Verify the update call
      expect(chain.updateFn).toHaveBeenCalledWith({
        stripe_customer_id: 'cus_456',
        stripe_subscription_id: 'sub_789',
        subscription_status: 'active',
        subscription_plan: 'premium',
        billing_interval: 'yearly',
      });

      // Verify update targeted the correct tenant
      expect(chain.eqAfterUpdate).toHaveBeenCalledWith('id', 'tenant-abc');
    });
  });

  // =========================================================================
  // customer.subscription.updated
  // =========================================================================

  describe('customer.subscription.updated', () => {
    it('maps status and period dates to tenant record', async () => {
      const periodStart = 1700000000;
      const periodEnd = 1702592000;

      const chain = setupSupabaseChain({
        selectResult: { data: { id: 'tenant-xyz' }, error: null },
      });

      const event = makeStripeEvent('customer.subscription.updated', {
        customer: 'cus_sub',
        status: 'active',
        items: {
          data: [{ current_period_start: periodStart, current_period_end: periodEnd }],
        },
      });
      mockConstructEvent.mockReturnValue(event);

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);

      expect(chain.updateFn).toHaveBeenCalledWith({
        subscription_status: 'active',
        subscription_current_period_start: new Date(periodStart * 1000).toISOString(),
        subscription_current_period_end: new Date(periodEnd * 1000).toISOString(),
      });
      expect(chain.eqAfterUpdate).toHaveBeenCalledWith('id', 'tenant-xyz');
    });
  });

  // =========================================================================
  // customer.subscription.deleted
  // =========================================================================

  describe('customer.subscription.deleted', () => {
    it('suspends tenant by setting cancelled status and is_active false', async () => {
      const chain = setupSupabaseChain({
        selectResult: { data: { id: 'tenant-del' }, error: null },
      });

      const event = makeStripeEvent('customer.subscription.deleted', {
        customer: 'cus_del',
        status: 'canceled',
      });
      mockConstructEvent.mockReturnValue(event);

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);

      expect(chain.updateFn).toHaveBeenCalledWith({
        subscription_status: 'cancelled',
        is_active: false,
      });
      expect(chain.eqAfterUpdate).toHaveBeenCalledWith('id', 'tenant-del');
      expect(logger.warn).toHaveBeenCalledWith('Tenant suspended — subscription cancelled', {
        tenantId: 'tenant-del',
      });
    });
  });

  // =========================================================================
  // invoice.payment_failed
  // =========================================================================

  describe('invoice.payment_failed', () => {
    it('marks tenant as past_due', async () => {
      const chain = setupSupabaseChain({
        selectResult: { data: { id: 'tenant-pay' }, error: null },
      });

      const event = makeStripeEvent('invoice.payment_failed', {
        customer: 'cus_pay',
      });
      mockConstructEvent.mockReturnValue(event);

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);

      expect(chain.updateFn).toHaveBeenCalledWith({
        subscription_status: 'past_due',
      });
      expect(chain.eqAfterUpdate).toHaveBeenCalledWith('id', 'tenant-pay');
      expect(logger.warn).toHaveBeenCalledWith('Payment failed for tenant', {
        tenantId: 'tenant-pay',
      });
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  describe('error handling', () => {
    it('returns 400 when signature verification fails', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const response = await POST(makeRequest());
      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe('Invalid signature');
      expect(logger.error).toHaveBeenCalledWith(
        'Webhook signature verification failed',
        expect.any(Error),
        { errorMessage: 'Invalid signature' },
      );
    });

    it('warns and continues when tenant is not found (subscription.updated)', async () => {
      setupSupabaseChain({
        selectResult: { data: null, error: { message: 'not found' } },
      });

      const event = makeStripeEvent('customer.subscription.updated', {
        customer: 'cus_ghost',
        status: 'active',
        items: { data: [] },
      });
      mockConstructEvent.mockReturnValue(event);

      const response = await POST(makeRequest());
      expect(response.status).toBe(200);

      const body = (await response.json()) as { received: boolean };
      expect(body.received).toBe(true);

      expect(logger.warn).toHaveBeenCalledWith('Subscription updated: tenant not found', {
        customerId: 'cus_ghost',
      });
    });
  });
});
