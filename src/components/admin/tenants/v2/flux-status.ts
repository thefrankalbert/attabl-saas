export type FluxStatus = 'pending' | 'confirmed' | 'prep' | 'ready' | 'delivered' | 'cancelled';

/**
 * Maps a raw `orders.status` value to a display bucket. Every status allowed by
 * `orders_status_check` has its own bucket; an unknown value falls back to
 * "pending" so a new status never crashes the list.
 */
export function mapFluxStatus(raw: string): FluxStatus {
  switch (raw.toLowerCase()) {
    case 'confirmed':
      return 'confirmed';
    case 'preparing':
    case 'in_progress':
    case 'accepted':
      return 'prep';
    case 'ready':
      return 'ready';
    case 'served':
    case 'delivered':
      return 'delivered';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return 'pending';
  }
}
