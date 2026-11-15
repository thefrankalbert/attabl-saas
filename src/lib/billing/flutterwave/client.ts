import { logger } from '@/lib/logger';
import { paymentLinkResponseSchema, verifyTransactionResponseSchema } from './schemas';
import type { VerifiedTransaction } from './schemas';

/**
 * Formes verifiees sur la documentation officielle Flutterwave v3:
 * - creation: POST /v3/payments, reponse { status: 'success', data: { link } }
 *   (https://developer.flutterwave.com/docs/collecting-payments/standard)
 * - verification: GET /v3/transactions/{id}/verify, reponse { status, data: { id,
 *   tx_ref, status, amount, currency, charged_amount, ... } }
 *   (https://developer.flutterwave.com/docs/transaction-verification)
 * - webhook: en-tete `verif-hash`, evenement `charge.completed`
 *   (https://developer.flutterwave.com/docs/webhooks)
 */
const API_BASE = 'https://api.flutterwave.com/v3';
const REQUEST_TIMEOUT_MS = 10_000;

export class FlutterwaveApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number | null,
  ) {
    super(message);
    this.name = 'FlutterwaveApiError';
  }
}

export interface CreatePaymentLinkInput {
  txRef: string;
  /** Unites entieres: XOF et XAF n'ont pas de decimales. */
  amount: number;
  currency: string;
  redirectUrl: string;
  customer: { email: string; name: string };
  title: string;
  description: string;
  meta: Record<string, string>;
}

/** Ce que l'application attend de Flutterwave. Les tests injectent une fausse implementation. */
export interface FlutterwaveClient {
  createPaymentLink(input: CreatePaymentLinkInput): Promise<string>;
  verifyTransaction(transactionId: number): Promise<VerifiedTransaction>;
}

export function createFlutterwaveClient(
  secretKey: string,
  fetchImpl: typeof fetch = fetch,
): FlutterwaveClient {
  async function call(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch (error) {
      logger.error('Flutterwave: appel impossible', error, { path });
      throw new FlutterwaveApiError('Flutterwave injoignable', null);
    }
    if (!response.ok) {
      logger.warn('Flutterwave: reponse en erreur', { path, httpStatus: response.status });
      throw new FlutterwaveApiError('Flutterwave a refuse la requete', response.status);
    }
    try {
      return await response.json();
    } catch {
      throw new FlutterwaveApiError('Reponse Flutterwave illisible', response.status);
    }
  }

  return {
    async createPaymentLink(input) {
      const raw = await call('/payments', {
        method: 'POST',
        body: JSON.stringify({
          tx_ref: input.txRef,
          amount: input.amount,
          currency: input.currency,
          redirect_url: input.redirectUrl,
          customer: { email: input.customer.email, name: input.customer.name },
          customizations: { title: input.title, description: input.description },
          meta: input.meta,
        }),
      });
      const parsed = paymentLinkResponseSchema.safeParse(raw);
      if (!parsed.success) {
        logger.error('Flutterwave: reponse de creation de lien inattendue', parsed.error);
        throw new FlutterwaveApiError('Reponse Flutterwave inattendue', null);
      }
      return parsed.data.data.link;
    },

    async verifyTransaction(transactionId) {
      const raw = await call(`/transactions/${transactionId}/verify`, { method: 'GET' });
      const parsed = verifyTransactionResponseSchema.safeParse(raw);
      if (!parsed.success) {
        logger.error('Flutterwave: reponse de verification inattendue', parsed.error);
        throw new FlutterwaveApiError('Reponse Flutterwave inattendue', null);
      }
      return parsed.data.data;
    },
  };
}
