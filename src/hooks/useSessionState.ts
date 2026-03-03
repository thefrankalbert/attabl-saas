'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

type SetStateAction<T> = T | ((prev: T) => T);
type Dispatch<A> = (action: A) => void;

function serialize(value: unknown): string {
  if (value instanceof Set) {
    return JSON.stringify({ __type: 'Set', data: Array.from(value) });
  }
  return JSON.stringify(value);
}

function deserialize<T>(raw: string, defaultValue: T): T {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.__type === 'Set' &&
      Array.isArray(parsed.data)
    ) {
      return new Set(parsed.data) as T;
    }
    return parsed as T;
  } catch {
    return defaultValue;
  }
}

function readStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return defaultValue;
    return deserialize(raw, defaultValue);
  } catch {
    return defaultValue;
  }
}

/**
 * Drop-in replacement for useState that persists state to sessionStorage.
 * State survives navigation but is cleared when the browser tab is closed.
 *
 * @param key - Unique key for this state (namespaced automatically as `attabl:admin:{key}`)
 * @param defaultValue - Default value when no stored value exists
 */
export function useSessionState<T>(
  key: string,
  defaultValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = `attabl:admin:${key}`;
  const defaultRef = useRef(defaultValue);

  const [state, setStateInternal] = useState<T>(() =>
    readStorage(storageKey, defaultValue)
  );

  const setState: Dispatch<SetStateAction<T>> = useCallback(
    (action: SetStateAction<T>) => {
      setStateInternal((prev) => {
        const next = typeof action === 'function' ? (action as (prev: T) => T)(prev) : action;
        try {
          sessionStorage.setItem(storageKey, serialize(next));
        } catch {
          // sessionStorage full or unavailable - state still works in memory
        }
        return next;
      });
    },
    [storageKey]
  );

  // Sync if key changes
  useEffect(() => {
    const stored = readStorage(storageKey, defaultRef.current);
    setStateInternal(stored);
  }, [storageKey]);

  return [state, setState];
}
