import type { Order, Tenant } from '@/types/admin.types';
import { generateReceiptHTML } from './receipt-html';
import { ouvrirEtImprimer } from './ouvrir-et-imprimer';

/** Format d'une fenetre de ticket thermique 80 mm. */
const FENETRE_THERMIQUE = { width: 350, height: 600 };

/**
 * Ouvre le recu et l'imprime une fois la police chargee.
 *
 * L'attente de la police et la course au chargement sont traitees dans
 * `ouvrirEtImprimer`, partagee par les trois documents: elles se repetaient
 * mot pour mot ici, dans la facture et dans le ticket cuisine, avec le meme
 * defaut dans les trois.
 */
export function printReceipt(order: Order, tenant: Tenant): boolean {
  return ouvrirEtImprimer(generateReceiptHTML(order, tenant), FENETRE_THERMIQUE);
}
