import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

const loggerError = vi.fn();
const loggerInfo = vi.fn();
vi.mock('@/lib/logger', () => ({
  logger: {
    error: (...a: unknown[]) => loggerError(...a),
    info: (...a: unknown[]) => loggerInfo(...a),
    warn: vi.fn(),
  },
}));

import { createStripeWebhookService } from '../../stripe-webhook.service';

function service() {
  return createStripeWebhookService({} as never, {} as Stripe);
}

describe('E11: evenements Stripe qui demandent une action humaine', () => {
  beforeEach(() => vi.clearAllMocks());

  it('alerte (Sentry via logger.error) sur invoice.finalization_failed', async () => {
    await service().handleEvent({
      type: 'invoice.finalization_failed',
      data: {
        object: {
          id: 'in_1',
          customer: 'cus_1',
          last_finalization_error: {
            code: 'customer_tax_location_invalid',
            type: 'invalid_request_error',
          },
        },
      },
    } as unknown as Stripe.Event);

    expect(loggerError).toHaveBeenCalledWith('Stripe invoice finalization failed', undefined, {
      invoiceId: 'in_1',
      customerId: 'cus_1',
      errorCode: 'customer_tax_location_invalid',
      errorType: 'invalid_request_error',
    });
    expect(loggerInfo).not.toHaveBeenCalledWith('Unhandled Stripe event type', expect.anything());
  });

  it('alerte sur radar.early_fraud_warning.created', async () => {
    await service().handleEvent({
      type: 'radar.early_fraud_warning.created',
      data: {
        object: {
          id: 'issfr_1',
          charge: { id: 'ch_1' },
          fraud_type: 'stolen_card',
          actionable: true,
        },
      },
    } as unknown as Stripe.Event);

    expect(loggerError).toHaveBeenCalledWith('Stripe early fraud warning', undefined, {
      warningId: 'issfr_1',
      chargeId: 'ch_1',
      fraudType: 'stolen_card',
      actionable: true,
    });
  });

  it('temoin: un evenement inconnu reste simplement journalise', async () => {
    await service().handleEvent({
      type: 'customer.created',
      data: { object: {} },
    } as unknown as Stripe.Event);

    expect(loggerError).not.toHaveBeenCalled();
    expect(loggerInfo).toHaveBeenCalledWith('Unhandled Stripe event type', {
      eventType: 'customer.created',
    });
  });
});
