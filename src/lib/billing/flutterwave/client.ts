import { logger } from '@/lib/logger';
import {
  listTransactionsResponseSchema,
  paymentLinkResponseSchema,
  verifyTransactionResponseSchema,
} from './schemas';
import type { VerifiedTransaction } from './schemas';

/**
 * Formes verifiees sur la documentation officielle Flutterwave v3:
 * - creation: POST /v3/payments, reponse { status: 'success', data: { link } }
 *   (https://developer.flutterwave.com/docs/collecting-payments/standard)
 * - verification: GET /v3/transactions/{id}/verify, reponse { status, data: { id,
 *   tx_ref, status, amount, currency, charged_amount, ... } }
 *   (https://developer.flutterwave.com/docs/transaction-verification)
 * - verification par reference: GET /v3/transactions/verify_by_reference?tx_ref=... meme
 *   reponse que par identifiant. Chemin releve dans la source officielle du SDK
 *   flutterwave-node-v3 1.3.1 (services/transactions/rave.verify-by-txref.js) et sa
 *   documentation (documentation/transactions.md, section "Verify transaction with
 *   reference"); la page de reference de developer.flutterwave.com n'a pas pu etre lue.
 * - liste: GET /v3/transactions (SDK flutterwave-node-v3 1.3.1, documentation/transactions.md,
 *   "Get all transactions": reponse { status, meta, data: [ { id, tx_ref, status, amount,
 *   currency, ... } ] }). La documentation du SDK ne cite que les filtres from/to: le filtre
 *   `tx_ref` n'y est PAS confirme. Par prudence le resultat est refiltre ici sur la reference
 *   exacte: si le filtre etait ignore, on ne verrait rien d'utile mais on n'appliquerait jamais
 *   la transaction d'un autre.
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
  /** Verification par reference (`tx_ref`): `null` si Flutterwave ne connait pas cette reference. */
  verifyByReference(txRef: string): Promise<VerifiedTransaction | null>;
  /**
   * Toutes les transactions d'une reference (un client peut retenter sur le meme
   * lien: un echec recent n'efface pas un paiement reussi plus ancien). Ne rend
   * que les elements dont la reference est EXACTEMENT celle demandee.
   */
  listTransactionsByReference(txRef: string): Promise<VerifiedTransaction[]>;
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

    async verifyByReference(txRef) {
      let raw: unknown;
      try {
        raw = await call(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`, {
          method: 'GET',
        });
      } catch (error) {
        // Reference inconnue (tentative jamais payee, cas le plus courant): refus 400/404
        // de Flutterwave, ou un corps `status: error`. Ce n'est pas une panne.
        if (
          error instanceof FlutterwaveApiError &&
          (error.httpStatus === 404 || error.httpStatus === 400)
        ) {
          return null;
        }
        throw error;
      }
      if ((raw as { status?: unknown } | null)?.status === 'error') return null;
      const parsed = verifyTransactionResponseSchema.safeParse(raw);
      if (!parsed.success) {
        logger.error('Flutterwave: reponse de verification par reference inattendue', parsed.error);
        throw new FlutterwaveApiError('Reponse Flutterwave inattendue', null);
      }
      return parsed.data.data;
    },

    async listTransactionsByReference(txRef) {
      let raw: unknown;
      try {
        raw = await call(`/transactions?tx_ref=${encodeURIComponent(txRef)}`, { method: 'GET' });
      } catch (error) {
        if (
          error instanceof FlutterwaveApiError &&
          (error.httpStatus === 404 || error.httpStatus === 400)
        ) {
          return [];
        }
        throw error;
      }
      if ((raw as { status?: unknown } | null)?.status === 'error') return [];
      const parsed = listTransactionsResponseSchema.safeParse(raw);
      if (!parsed.success) {
        logger.error('Flutterwave: reponse de liste inattendue', parsed.error);
        throw new FlutterwaveApiError('Reponse Flutterwave inattendue', null);
      }
      return parsed.data.data.filter((t) => t.tx_ref === txRef);
    },
  };
}
