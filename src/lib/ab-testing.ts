// A/B test framework - cookie-based, deterministic hash assignment
// Experiments:
//   trial:  7d vs 14d trial length (controls trial_ends_at at signup)
//   toggle: 2-positions vs 3-positions on pricing page billing toggle
//
// Components subscribe via useSyncExternalStore; initAbVariants() sets cookies
// and notifies subscribers. No setState-in-effect pattern.

export const AB_COOKIE_ID = 'attabl_ab_id';
export const AB_COOKIE_TRIAL = 'attabl_ab_trial';
export const AB_COOKIE_TOGGLE = 'attabl_ab_toggle';
export const AB_COOKIE_DAYS = 60;

export type TrialVariant = '7d' | '14d';
export type ToggleVariant = '2' | '3';

export interface AbVariants {
  trial: TrialVariant;
  toggle: ToggleVariant;
}

const SERVER_DEFAULT: AbVariants = { trial: '14d', toggle: '3' };

// djb2-based hash using Math.imul to keep arithmetic in 32-bit signed space
function hashToIndex(str: string, modulo: number): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h, 33) ^ str.charCodeAt(i);
  }
  return Math.abs(h) % modulo;
}

export function assignTrialVariant(id: string): TrialVariant {
  return hashToIndex(id + ':trial', 2) === 0 ? '7d' : '14d';
}

export function assignToggleVariant(id: string): ToggleVariant {
  return hashToIndex(id + ':toggle', 2) === 0 ? '2' : '3';
}

// --- Client-side cookie helpers (browser only) ---

export function getClientCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setClientCookie(name: string, value: string, days: number): void {
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

// --- External store for useSyncExternalStore ---

let _variants: AbVariants | null = null;
let _listeners: Array<() => void> = [];

function notifyListeners(): void {
  for (const l of _listeners) l();
}

export function subscribeAbVariants(listener: () => void): () => void {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}

export function getAbVariantsSnapshot(): AbVariants {
  if (_variants) return _variants;
  if (typeof document === 'undefined') return SERVER_DEFAULT;
  const id = getClientCookie(AB_COOKIE_ID);
  if (!id) return SERVER_DEFAULT;
  const rawTrial = getClientCookie(AB_COOKIE_TRIAL);
  const rawToggle = getClientCookie(AB_COOKIE_TOGGLE);
  const trial: TrialVariant =
    rawTrial === '7d' || rawTrial === '14d' ? rawTrial : assignTrialVariant(id);
  const toggle: ToggleVariant =
    rawToggle === '2' || rawToggle === '3' ? rawToggle : assignToggleVariant(id);
  _variants = { trial, toggle };
  return _variants;
}

export function getAbVariantsServerSnapshot(): AbVariants {
  return SERVER_DEFAULT;
}

// Sets AB cookies and notifies subscribers (triggers useSyncExternalStore re-reads).
// Call this once on client mount from a useEffect - no setState needed.
export function initAbVariants(qaOverrides?: {
  trial?: string | null;
  toggle?: string | null;
}): AbVariants {
  let id = getClientCookie(AB_COOKIE_ID);
  if (!id) {
    id = crypto.randomUUID();
    setClientCookie(AB_COOKIE_ID, id, AB_COOKIE_DAYS);
  }

  const rawTrial = qaOverrides?.trial ?? getClientCookie(AB_COOKIE_TRIAL);
  const trial: TrialVariant =
    rawTrial === '7d' || rawTrial === '14d' ? rawTrial : assignTrialVariant(id);
  setClientCookie(AB_COOKIE_TRIAL, trial, AB_COOKIE_DAYS);

  const rawToggle = qaOverrides?.toggle ?? getClientCookie(AB_COOKIE_TOGGLE);
  const toggle: ToggleVariant =
    rawToggle === '2' || rawToggle === '3' ? rawToggle : assignToggleVariant(id);
  setClientCookie(AB_COOKIE_TOGGLE, toggle, AB_COOKIE_DAYS);

  _variants = { trial, toggle };
  notifyListeners();
  return _variants;
}

// --- Server-side helper (API routes) ---

// Parses the trial variant from the raw Cookie header string.
export function parseAbTrialFromCookieHeader(cookieHeader: string): TrialVariant | null {
  for (const part of cookieHeader.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const name = part.slice(0, eqIndex).trim();
    if (name !== 'attabl_ab_trial') continue;
    const val = decodeURIComponent(part.slice(eqIndex + 1).trim());
    return val === '7d' || val === '14d' ? val : null;
  }
  return null;
}
