'use client';

import { useEffect, useSyncExternalStore } from 'react';

const tableKey = (tenantSlug: string) => `attabl_${tenantSlug}_table`;

/**
 * Duree de vie d'une table scannee. Sans limite, un client revenu le
 * lendemain par un simple lien envoyait sa commande a la table de la veille
 * (audit du 2026-11-14). Six heures couvrent largement un repas.
 */
export const SCANNED_TABLE_TTL_MS = 6 * 60 * 60 * 1000;

interface StoredTable {
  table: string;
  at: number;
}

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
    const stored: StoredTable = { table: tableNumber, at: Date.now() };
    localStorage.setItem(tableKey(tenantSlug), JSON.stringify(stored));
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
 * Returns null when the tenant is unknown, nothing is stored, the table is
 * older than SCANNED_TABLE_TTL_MS, or localStorage is unavailable.
 */
export function readScannedTable(
  tenantSlug: string | null,
  now: number = Date.now(),
): string | null {
  if (!tenantSlug) return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(tableKey(tenantSlug));
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Ancien format (numero en clair, ecrit avant la duree de vie): garde tel
    // quel, pour ne pas detacher de sa table un client deja assis.
    return raw;
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    typeof (parsed as StoredTable).table === 'string' &&
    typeof (parsed as StoredTable).at === 'number'
  ) {
    const { table, at } = parsed as StoredTable;
    return now - at <= SCANNED_TABLE_TTL_MS ? table : null;
  }
  // Valeur JSON qui n'est pas un objet (ex: un numero "12"): ancien format.
  return typeof parsed === 'number' || typeof parsed === 'string' ? String(parsed) : null;
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
