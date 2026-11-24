import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import type { FlutterwaveClient } from '@/lib/billing/flutterwave/client';
import type { VerifiedTransaction } from '@/lib/billing/flutterwave/schemas';
import { ServiceError } from './errors';

/**
 * Anomalies d'encaissement Flutterwave (audits SM10 et SM8): la trace DURABLE
 * de l'argent encaisse et non applique, et le rapprochement des paiements deja
 * regles avec Flutterwave. Les lignes vont dans `flutterwave_anomalies`
 * (migration 20261124130000), lisible par le super administrateur seulement.
 * Le client recu est service_role: chaque requete sur une table d'un
 * restaurant filtre donc par tenant.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fenetre du rapprochement des paiements deja regles (audit SM8). */
const SETTLED_AUDIT_DAYS = 30;

/** Types d'anomalie de la table `flutterwave_anomalies` (meme liste que sa contrainte CHECK). */
type AnomalyKind = 'refund_due' | 'provider_mismatch' | 'paid_period_not_active';

interface AnomalyInput {
  kind: AnomalyKind;
  flwTransactionId: number;
  reason: string;
  tenantId: string | null;
  paymentId: string | null;
  txRef: string | null;
  amount: number | null;
  currency: string | null;
}

interface SettledRow {
  id: string;
  tenant_id: string;
  tx_ref: string;
  status: string;
  amount: number | string;
  currency: string;
  flw_transaction_id: number | string;
  period_end: string | null;
}

interface TenantPeriodRow {
  subscription_status: string | null;
  subscription_current_period_end: string | null;
  deleted_at: string | null;
}

export function createFlutterwaveAnomalyRecorder(
  supabase: SupabaseClient,
  now: () => Date = () => new Date(),
) {
  /**
   * Trace DURABLE d'une anomalie (audit SM10): un journal se perd, une ligne
   * reste dans la liste des remboursements a faire du super administrateur.
   * Idempotent: une ligne deja presente (meme transaction, meme type) est un
   * succes (rend `false`: rien de nouveau). Un echec d'ecriture LEVE: le webhook
   * repond 500, Flutterwave relance, et l'anomalie n'est jamais perdue en silence.
   */
  async function recordAnomaly(anomaly: AnomalyInput): Promise<boolean> {
    const { error } = await supabase.from('flutterwave_anomalies').insert({
      kind: anomaly.kind,
      flw_transaction_id: anomaly.flwTransactionId,
      reason: anomaly.reason,
      tenant_id: anomaly.tenantId,
      payment_id: anomaly.paymentId,
      tx_ref: anomaly.txRef,
      amount: anomaly.amount,
      currency: anomaly.currency,
      detected_at: now().toISOString(),
    });
    if (error && error.code !== '23505') {
      logger.error('Flutterwave: anomalie NON enregistree', error, {
        tenantId: anomaly.tenantId,
        flwTransactionId: anomaly.flwTransactionId,
        kind: anomaly.kind,
        reason: anomaly.reason,
      });
      throw new ServiceError('Enregistrement de l anomalie impossible', 'INTERNAL');
    }
    return !error;
  }

  /**
   * Argent encaisse et NON applique: journal d'erreur "remboursement a faire"
   * (alerte) puis ligne "a rembourser" (trace durable).
   */
  function refundDue(
    tx: VerifiedTransaction,
    reason: string,
    payment: { id: string; tenant_id: string } | null,
    contexte: Record<string, unknown> = {},
  ): Promise<boolean> {
    logger.error('Flutterwave: paiement encaisse mais NON applique, remboursement a faire', {
      tenantId: payment?.tenant_id ?? null,
      paymentId: payment?.id ?? null,
      txRef: tx.tx_ref,
      flwTransactionId: tx.id,
      amount: tx.amount,
      currency: tx.currency,
      reason,
      ...contexte,
    });
    return recordAnomaly({
      kind: 'refund_due',
      flwTransactionId: tx.id,
      reason,
      tenantId: payment?.tenant_id ?? null,
      paymentId: payment?.id ?? null,
      txRef: tx.tx_ref,
      amount: tx.amount,
      currency: tx.currency,
    });
  }

  return { recordAnomaly, refundDue };
}

export function createFlutterwaveReconciliationService(
  supabase: SupabaseClient,
  deps: { client: FlutterwaveClient; now?: () => Date },
) {
  const now = deps.now ?? (() => new Date());
  const { recordAnomaly } = createFlutterwaveAnomalyRecorder(supabase, now);

  async function loadTenantPeriod(tenantId: string): Promise<TenantPeriodRow | null> {
    const { data, error } = await supabase
      .from('tenants')
      .select('subscription_status, subscription_current_period_end, deleted_at')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) throw new ServiceError('Lecture du restaurant impossible', 'INTERNAL');
    return (data as TenantPeriodRow | null) ?? null;
  }

  return {
    /**
     * Rapprochement (audit SM8): relit chez Flutterwave les tentatives DEJA
     * reglees (appliquees ou refusees) des 30 derniers jours, et inscrit dans
     * `flutterwave_anomalies` tout ecart:
     *   - Flutterwave ne confirme plus la transaction enregistree (statut,
     *     reference, devise, ou montant sous le prix attendu): `provider_mismatch`;
     *   - une periode payee est en cours mais le restaurant n'est pas actif
     *     jusqu'a sa fin: `paid_period_not_active`;
     *   - une AUTRE transaction reussie existe sur la meme reference (double
     *     paiement dont le webhook s'est perdu): `refund_due`.
     * Ne modifie AUCUN abonnement: un ecart se juge a la main. Meme rotation
     * que le rattrapage (`last_checked_at`).
     *
     * Limite assumee: la liste par reference (`GET /v3/transactions?tx_ref=`)
     * n'est pas confirmee par la documentation (voir client.ts); si Flutterwave
     * ignore ce filtre, un double paiement ancien peut echapper a ce controle.
     * Un releve complet par periode (`GET /v3/transactions?from=&to=`, pagine)
     * compare a la base reste a ajouter si ce risque se materialise.
     */
    async reconcileSettled(
      limit = 50,
    ): Promise<{ settledChecked: number; anomalies: number; settledErrors: number }> {
      // `anomalies` compte les ecarts NOUVEAUX de ce passage.
      const cutoff = new Date(now().getTime() - SETTLED_AUDIT_DAYS * DAY_MS).toISOString();
      const { data, error } = await supabase
        .from('flutterwave_payments')
        .select('id, tenant_id, tx_ref, status, amount, currency, flw_transaction_id, period_end')
        .neq('status', 'pending')
        .gt('created_at', cutoff)
        .order('last_checked_at', { ascending: true, nullsFirst: true })
        .limit(limit);
      if (error) throw new ServiceError('Lecture des paiements regles impossible', 'INTERNAL');

      let anomalies = 0;
      let settledErrors = 0;
      const rows = (data ?? []) as SettledRow[];
      for (const row of rows) {
        await supabase
          .from('flutterwave_payments')
          .update({ last_checked_at: now().toISOString() })
          .eq('id', row.id)
          .eq('tenant_id', row.tenant_id);
        const recordedId = Number(row.flw_transaction_id);
        const base = {
          flwTransactionId: recordedId,
          tenantId: row.tenant_id,
          paymentId: row.id,
          txRef: row.tx_ref,
        };
        try {
          const tx = await deps.client.verifyTransaction(recordedId);
          const ecarts: string[] = [];
          if (tx.status !== 'successful') ecarts.push(`statut ${tx.status}`);
          if (tx.tx_ref !== row.tx_ref) ecarts.push('reference differente');
          if (tx.currency !== row.currency) ecarts.push(`devise ${tx.currency}`);
          if (row.status === 'successful' && tx.amount < Number(row.amount)) {
            ecarts.push('montant sous le prix attendu');
          }
          if (ecarts.length > 0) {
            const nouvelle = await recordAnomaly({
              ...base,
              kind: 'provider_mismatch',
              reason: ecarts.join(', ').slice(0, 200),
              amount: tx.amount,
              currency: tx.currency,
            });
            if (nouvelle) anomalies += 1;
          }

          if (
            row.status === 'successful' &&
            row.period_end &&
            new Date(row.period_end).getTime() > now().getTime()
          ) {
            const tenant = await loadTenantPeriod(row.tenant_id);
            const actifJusquaLaFin =
              !!tenant &&
              !tenant.deleted_at &&
              tenant.subscription_status === 'active' &&
              !!tenant.subscription_current_period_end &&
              new Date(tenant.subscription_current_period_end).getTime() >=
                new Date(row.period_end).getTime();
            if (!actifJusquaLaFin) {
              const nouvelle = await recordAnomaly({
                ...base,
                kind: 'paid_period_not_active',
                reason: `restaurant ${tenant?.deleted_at ? 'supprime' : (tenant?.subscription_status ?? 'introuvable')}`,
                amount: Number(row.amount),
                currency: row.currency,
              });
              if (nouvelle) anomalies += 1;
            }
          }

          const autres = (await deps.client.listTransactionsByReference(row.tx_ref)).filter(
            (t) => t.status === 'successful' && t.id !== recordedId,
          );
          for (const autre of autres) {
            const nouvelle = await recordAnomaly({
              ...base,
              flwTransactionId: autre.id,
              kind: 'refund_due',
              reason: 'ALREADY_SETTLED_BY_OTHER_TRANSACTION',
              amount: autre.amount,
              currency: autre.currency,
            });
            // Journal seulement pour un double paiement NOUVEAU (pas a chaque passage).
            if (!nouvelle) continue;
            anomalies += 1;
            logger.error(
              'Flutterwave: paiement encaisse mais NON applique, remboursement a faire',
              {
                tenantId: row.tenant_id,
                paymentId: row.id,
                txRef: row.tx_ref,
                recordedFlwTransactionId: recordedId,
                flwTransactionId: autre.id,
                reason: 'ALREADY_SETTLED_BY_OTHER_TRANSACTION',
              },
            );
          }
        } catch (err) {
          settledErrors += 1;
          logger.error('Flutterwave: rapprochement impossible', err, { tenantId: row.tenant_id });
        }
      }
      // Seuls les ecarts NOUVEAUX alertent: un ecart deja inscrit reste dans la
      // table, sans relancer l'alerte a chaque passage.
      if (anomalies > 0) {
        logger.error('Flutterwave: nouveaux ecarts trouves au rapprochement', undefined, {
          settledChecked: rows.length,
          anomalies,
        });
      }
      return { settledChecked: rows.length, anomalies, settledErrors };
    },
  };
}
