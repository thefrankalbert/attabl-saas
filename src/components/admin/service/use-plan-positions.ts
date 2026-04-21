'use client';

import { useCallback, useMemo, useState } from 'react';

export interface PlanPosition {
  x: number;
  y: number;
}

export type PlanPositions = Record<string, PlanPosition>;

function storageKey(tenantId: string, zoneId: string): string {
  return `attabl:service-plan:${tenantId}:${zoneId}`;
}

function safeRead(tenantId: string, zoneId: string): PlanPositions {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId, zoneId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as PlanPositions;
  } catch {
    return {};
  }
}

function safeWrite(tenantId: string, zoneId: string, positions: PlanPositions): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(tenantId, zoneId), JSON.stringify(positions));
  } catch {
    // storage full or unavailable - silent fail
  }
}

/**
 * Per-zone localStorage-backed positions for Plan 2D.
 *
 * The Plan 2D view is client-only (behind a toggle), so reading localStorage
 * inside `useMemo` during render is safe w.r.t. SSR hydration. A `version`
 * counter invalidates the memo on write to avoid the `set-state-in-effect`
 * anti-pattern.
 */
export function usePlanPositions(tenantId: string, zoneId: string | null) {
  const [version, setVersion] = useState(0);

  const positions = useMemo<PlanPositions>(
    () => (zoneId ? safeRead(tenantId, zoneId) : {}),
    // `version` is intentionally in deps to re-read after writes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenantId, zoneId, version],
  );

  const setPosition = useCallback(
    (tableId: string, position: PlanPosition) => {
      if (!zoneId) return;
      const current = safeRead(tenantId, zoneId);
      safeWrite(tenantId, zoneId, { ...current, [tableId]: position });
      setVersion((v) => v + 1);
    },
    [tenantId, zoneId],
  );

  const reset = useCallback(() => {
    if (!zoneId) return;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(storageKey(tenantId, zoneId));
      } catch {
        // ignore
      }
    }
    setVersion((v) => v + 1);
  }, [tenantId, zoneId]);

  return { positions, setPosition, reset };
}
