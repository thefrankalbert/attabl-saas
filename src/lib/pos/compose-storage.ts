/**
 * Browser storage of the order being composed at the till.
 */
import { adminStoragePrefix } from '@/lib/admin-session-storage';

/**
 * sessionStorage keys of what one order is composed of (useSessionState adds the
 * same per-restaurant prefix, adminStoragePrefix). Cleared DIRECTLY after a sale: a state setter does not
 * run once the till is unmounted, and a cashier who left the page mid-send came
 * back to a full cart with a fresh key - one tap and the sale was made twice
 * (audit caisse 2026-11-15).
 */
const COMPOSE_STORAGE_KEYS = [
  'pos:cart',
  'pos:orderNotes',
  'pos:roomNumber',
  'pos:deliveryAddress',
  'pos:selectedTable',
  'pos:orderRequestId',
] as const;
const orderKeyStorage = (): string => `${adminStoragePrefix()}pos:orderRequestId`;

export function readOrderKey(): string | null {
  try {
    return sessionStorage.getItem(orderKeyStorage());
  } catch {
    return null;
  }
}

export function writeOrderKey(key: string): void {
  try {
    sessionStorage.setItem(orderKeyStorage(), key);
  } catch {
    /* storage unavailable: the in-flight lock still prevents a double tap */
  }
}

export function clearComposeStorage(): void {
  for (const key of COMPOSE_STORAGE_KEYS) {
    try {
      sessionStorage.removeItem(`${adminStoragePrefix()}${key}`);
    } catch {
      /* ignore */
    }
  }
}

/** Forget the pending key: the cart was emptied by hand, the next order is new. */
export function dropOrderKey(): void {
  try {
    sessionStorage.removeItem(orderKeyStorage());
  } catch {
    /* ignore */
  }
}
