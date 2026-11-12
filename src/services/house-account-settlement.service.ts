import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import { createOrderAnnotationService } from './order-annotation.service';
import { createPaymentService } from './payment.service';

/**
 * Solder une ardoise = ENCAISSER ce qu'elle doit, puis la fermer.
 *
 * Audit du 2026-11-10 (C-054). "Solder" ne faisait que poser l'etiquette
 * `settled` sur l'ardoise: aucune ligne n'entrait au registre des paiements, les
 * commandes restaient impayees, et l'ecran affichait "Soldee" a cote de "reste
 * du 3 500 FCFA". L'argent recu du client n'apparaissait jamais dans le chiffre
 * d'affaires, et l'ardoise fermee ne permettait plus de retrouver la dette.
 *
 * Le solde de chaque commande est LU AU REGISTRE au moment de solder (du moins
 * le net deja encaisse): une commande payee en partie n'est encaissee que de
 * son reste. Si une commande echoue, l'ardoise reste ouverte et un second essai
 * ne reprend que ce qui manque, puisque le reste est recalcule a chaque fois.
 */
interface SettleInput {
  settledBy?: string | null;
}

export interface HouseAccountSettlement {
  /** Nombre de commandes encaissees par ce solde. */
  orders: number;
  /** Montant total entre au registre, en unites MINEURES. */
  collected: number;
}

// Le seul moyen de paiement actif (src/lib/payments/methods.ts). Une ardoise se
// regle au comptoir; quand un second moyen sera actif, le demander a l'ecran.
const SETTLEMENT_METHOD = 'cash';

export function createHouseAccountSettlementService(supabase: SupabaseClient) {
  return {
    async settle(
      accountId: string,
      tenantId: string,
      { settledBy }: SettleInput,
    ): Promise<HouseAccountSettlement> {
      const { data: account, error: accountError } = await supabase
        .from('house_accounts')
        .select('id, status')
        .eq('id', accountId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (accountError) {
        throw new ServiceError('Erreur lors du chargement de l ardoise', 'INTERNAL', accountError);
      }
      if (!account) {
        throw new ServiceError('Ardoise introuvable', 'NOT_FOUND');
      }
      // Deja soldee: un double clic ou un rejeu ne doit rien encaisser de plus.
      if (account.status === 'settled') {
        return { orders: 0, collected: 0 };
      }

      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('house_account_id', accountId)
        .neq('status', 'cancelled')
        .in('payment_status', ['pending', 'partial']);

      if (ordersError) {
        throw new ServiceError(
          'Erreur lors du chargement des commandes de l ardoise',
          'INTERNAL',
          ordersError,
        );
      }

      const payments = createPaymentService(supabase);
      let collected = 0;
      let settledOrders = 0;
      for (const order of orders ?? []) {
        const summary = await payments.getSummary(order.id as string, tenantId);
        const remaining = summary.due - summary.net;
        if (remaining <= 0) continue;
        await payments.recordTender(order.id as string, tenantId, {
          amount: remaining,
          method: SETTLEMENT_METHOD,
          createdBy: settledBy ?? null,
        });
        collected += remaining;
        settledOrders += 1;
      }

      // Seulement une fois TOUT encaisse: une ardoise fermee ne doit plus rien.
      await createOrderAnnotationService(supabase).settleHouseAccount(accountId, tenantId, {
        settledBy,
      });

      return { orders: settledOrders, collected };
    },
  };
}
