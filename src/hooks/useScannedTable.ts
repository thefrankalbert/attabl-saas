'use client';

import { useEffect, useSyncExternalStore } from 'react';

const tableKey = (tenantSlug: string) => `attabl_${tenantSlug}_table`;

// In-tab listeners: the `storage` event only fires in OTHER tabs, so a write
// made here notifies the readers itself.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Persist the customer's table for a tenant. The cart reads this key back when
 * the order is placed, so it is what attaches an order to its table.
 */
export function saveScannedTable(tenantSlug: string, tableNumber: string) {
  try {
    localStorage.setItem(tableKey(tenantSlug), tableNumber);
  } catch {
    // localStorage unavailable (private mode) - nothing to persist
  }
  listeners.forEach((listener) => listener());
}

/**
 * Forget the persisted table (the server said it does not exist, C-061): the
 * next order goes out as takeaway instead of failing again.
 */
export function clearScannedTable(tenantSlug: string) {
  try {
    localStorage.removeItem(tableKey(tenantSlug));
  } catch {
    // localStorage unavailable - nothing to forget
  }
  listeners.forEach((listener) => listener());
}

/**
 * The persisted table for a tenant, read synchronously (e.g. at order time).
 * Returns null when the tenant is unknown, nothing is stored, or localStorage
 * is unavailable.
 */
export function readScannedTable(tenantSlug: string | null): string | null {
  if (!tenantSlug) return null;
  try {
    return localStorage.getItem(tableKey(tenantSlug));
  } catch {
    return null;
  }
}

/**
 * The table the customer sits at, for one tenant. A table carried by the scanned
 * URL (`initialTable`) is persisted on arrival; the hook returns the persisted
 * table and re-renders when it changes. Used by every storefront entry a QR can
 * open, so the root page and /menu attach the table the same way.
 */
export function useScannedTable(tenantSlug: string | null, initialTable?: string): string | null {
  const table = useSyncExternalStore(
    subscribe,
    () => readScannedTable(tenantSlug),
    () => null,
  );

  useEffect(() => {
    if (tenantSlug && initialTable) saveScannedTable(tenantSlug, initialTable);
  }, [tenantSlug, initialTable]);

  return table;
}
