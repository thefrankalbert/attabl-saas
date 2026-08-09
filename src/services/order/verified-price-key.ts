import type { OrderItemInput } from '@/lib/validations/order.schema';

/**
 * Cle d'une LIGNE de panier dans la carte des prix verifies par le serveur.
 *
 * Constat F8: cette carte etait indexee par `menu_item_id` seul. Un panier
 * contenant "Pizza petite 3 000" et "Pizza grande 5 000" - meme menu_item_id,
 * deux variantes - n'y gardait que le dernier prix ecrit. `orders.total` restait
 * juste (8 000), mais les DEUX lignes order_items etaient enregistrees a 5 000:
 * SUM(price_at_order * quantity) != orders.total, le ticket client est faux et
 * tout rapprochement ligne a ligne est fausse.
 *
 * La variante est identifiee par son id quand il existe, sinon par son nom
 * normalise - exactement l'ordre de resolution que suit la validation cote
 * serveur pour retrouver le prix (id d'abord, nom en repli).
 */
export function verifiedPriceKey(item: Pick<OrderItemInput, 'id' | 'selectedVariant'>): string {
  const variant = item.selectedVariant;
  if (!variant) return `${item.id}:`;
  const variantKey = variant.id ?? variant.name_fr.toLowerCase();
  return `${item.id}:${variantKey}`;
}
