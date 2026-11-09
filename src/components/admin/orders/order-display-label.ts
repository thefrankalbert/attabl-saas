import type { Order } from '@/types/admin.types';

/**
 * Libelle lisible d'une commande pour l'equipe: le numero metier
 * (ex. CMD-20261109-002) quand il existe, sinon le debut de l'identifiant.
 */
export function orderDisplayLabel(order: Pick<Order, 'id' | 'order_number'>): string {
  return order.order_number || `#${order.id.slice(0, 8).toUpperCase()}`;
}
