import { fromMinorUnits } from '@/lib/utils/money';
import type { CurrencyCode, Order } from '@/types/admin.types';

/**
 * Montant a reclamer au client, en unites MAJEURES.
 *
 * POURQUOI CE FICHIER EXISTE. Le calcul tenait sur une ligne dans
 * `PaymentModal`, et cette ligne se trompait: elle ne lisait que
 * `order.total_price`. Or `total_price` n'est PAS une colonne de la base -
 * c'est un champ derive que CHAQUE appelant doit remplir depuis la colonne
 * `total`. La liste des commandes (`useOrders`) renvoie la ligne brute sans ce
 * mappage. Consequence mesuree le 2026-11-06 sur une commande de 7 500 FCFA
 * ouverte depuis cette liste: l'ecran d'encaissement annoncait "MONTANT A
 * PAYER 0 FCFA", et la validation acceptait ce zero.
 *
 * Le calcul vit donc ici, isole et teste: c'est de l'argent reclame a un
 * client, et le detail des unites (mineures en base, majeures a l'ecran) est
 * exactement le genre de regle qu'on ne verifie pas a l'oeil.
 */
export interface AmountToCollectInput {
  /**
   * Mode PANIER (caisse, commande pas encore creee): total deja calcule cote
   * navigateur, en unites MAJEURES. Prioritaire quand il est fourni.
   */
  totalProp?: number;
  /** Mode COMMANDE: la commande lue en base, dont les montants sont MINEURS. */
  order?: Pick<Order, 'id' | 'total_price' | 'total'>;
  currency: CurrencyCode;
}

export function amountToCollectMajor({ totalProp, order, currency }: AmountToCollectInput): number {
  if (totalProp != null) return totalProp;

  const isOrderMode = !!order?.id;
  if (!isOrderMode) return 0;

  // `total_price` quand l'appelant l'a mappe, `total` sinon: les deux portent
  // la meme valeur en unites mineures, et aucun appelant ne peut contourner ce
  // repli puisqu'il vit au seul endroit ou l'argent est reclame.
  const minor = order?.total_price ?? order?.total;
  return fromMinorUnits(Number(minor ?? 0), currency);
}
