/** Donnees et statuts de la page de suivi d'une commande (vitrine). */

import type { TrackedLineModifier } from '@/lib/utils/order-line-display';

interface DetailItem {
  name: string;
  quantity: number;
  price: number;
  menu_item_id?: string | null;
  image_url?: string | null;
  modifiers: TrackedLineModifier[];
  notes: string | null;
}

export interface OrderDetailData {
  id: string;
  order_number: string;
  table_number: string | null;
  status: string;
  total: number;
  subtotal: number | null;
  tip_amount: number;
  created_at: string;
  items: DetailItem[];
}

// Shape returned by the get_orders_for_tracking RPC (non-PII columns only).
export interface TrackedDetailRow {
  id: string;
  order_number: string;
  table_number: string | null;
  status: string;
  total: number;
  subtotal: number | null;
  tip_amount: number | null;
  created_at: string;
  order_items: Array<{
    item_name: string;
    quantity: number;
    price_at_order: number;
    menu_item_id: string | null;
    image_url: string | null;
    modifiers?: unknown;
    customer_notes?: string | null;
  }> | null;
}

/**
 * Libelle i18n par statut REEL de la commande.
 *
 * POURQUOI CETTE TABLE EXISTE. Cette page n'avait que DEUX etats: annulee, ou
 * tout le reste. Une commande qui venait d'etre passee ('pending') affichait
 * donc "Commande servie" avec une coche verte et le badge "Terminee". Le
 * convive lisait que son plat etait deja servi alors que la cuisine ne l'avait
 * pas encore vu, et il n'avait aucun moyen de savoir ou en etait sa commande.
 * Les sept statuts de `orders_status_check` sont couverts ici, et les cles
 * i18n existaient deja toutes (fr-FR et en-US).
 */
export const CLES_LIBELLE_STATUT: Record<string, string> = {
  pending: 'statusPending',
  confirmed: 'statusConfirmed',
  preparing: 'statusPreparing',
  ready: 'statusReady',
  delivered: 'statusDelivered',
  served: 'statusServed',
  cancelled: 'statusCancelled',
};

/** Statuts terminaux ou la commande a bien ete remise au convive. */
export const STATUTS_SERVIS = new Set(['served', 'delivered']);
