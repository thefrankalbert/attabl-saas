import { useSyncExternalStore } from 'react';

/**
 * Current time, floored to the minute, or `null` until the client has hydrated.
 *
 * Why null on the server: an SSR-ed "now" can never match the browser's "now"
 * (render time differs, and so does the timezone used by toLocaleTimeString).
 * `useState(() => new Date())` made the dashboard throw a React hydration
 * error ("il y a 9 min" on the client vs "il y a 8 min" on the server). With
 * useSyncExternalStore, React uses the SERVER snapshot during hydration on
 * both sides, then re-renders with the real minute: no mismatch.
 */
const MINUTE_MS = 60_000;

function subscribe(onTick: () => void): () => void {
  const id = setInterval(onTick, MINUTE_MS);
  return () => clearInterval(id);
}

function getSnapshot(): number {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

function getServerSnapshot(): null {
  return null;
}

export function useMinuteClock(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
