import type { OpeningHoursDay, OpeningHoursMap } from '@/types/admin.types';

export interface OpeningState {
  isOpen: boolean;
  nextOpenAt: string | null;
}

const DAYS: OpeningHoursDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const DAY_LABELS_FR: Record<OpeningHoursDay, string> = {
  mon: 'Lundi',
  tue: 'Mardi',
  wed: 'Mercredi',
  thu: 'Jeudi',
  fri: 'Vendredi',
  sat: 'Samedi',
  sun: 'Dimanche',
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface LocalClock {
  /** 0 = dimanche ... 6 = samedi, dans le fuseau du restaurant. */
  day: number;
  /** Minutes depuis minuit, dans le fuseau du restaurant. */
  minutes: number;
  /** Date locale AAAA-MM-JJ (cle stable "une fois par jour"). */
  ymd: string;
}

/**
 * Jour et heure DU RESTAURANT. Sans fuseau, `getHours()` lit l'horloge du
 * serveur (UTC sur Vercel): un restaurant du Cameroun (UTC+1) ouvrait et
 * fermait une heure trop tard sur la vitrine.
 */
export function localClock(now: Date, timeZone: string): LocalClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return {
    day: WEEKDAY_INDEX[get('weekday')] ?? 0,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

function parseHHmm(value: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function toMinutes(h: number, m: number): number {
  return h * 60 + m;
}

function formatHHmm(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Plage du jour en minutes; `overnight` = ferme apres minuit (ex. 18:00-02:00). */
function slotOf(
  openingHours: OpeningHoursMap,
  day: OpeningHoursDay,
): { openMin: number; closeMin: number; overnight: boolean; label: string } | null {
  const slot = openingHours[day];
  if (!slot) return null;
  const open = parseHHmm(slot.open);
  const close = parseHHmm(slot.close);
  if (!open || !close) return null;
  const openMin = toMinutes(open.h, open.m);
  const closeMin = toMinutes(close.h, close.m);
  return { openMin, closeMin, overnight: closeMin <= openMin, label: formatHHmm(open.h, open.m) };
}

/** Heure d'ouverture du jour (minutes locales), ou null si ferme ce jour-la. */
export function openingMinutesForDay(
  openingHours: OpeningHoursMap | null | undefined,
  day: number,
): number | null {
  if (!openingHours) return null;
  return slotOf(openingHours, DAYS[day])?.openMin ?? null;
}

export function computeOpeningState(
  openingHours: OpeningHoursMap | null | undefined,
  now: Date,
  timeZone: string,
): OpeningState {
  if (!openingHours || Object.keys(openingHours).length === 0) {
    return { isOpen: true, nextOpenAt: null };
  }

  const { day: currentDayIdx, minutes: currentMinutes } = localClock(now, timeZone);

  // La nuit d'hier deborde-t-elle sur ce matin ? (ex. ouvert hier 18:00-02:00)
  const yesterday = slotOf(openingHours, DAYS[(currentDayIdx + 6) % 7]);
  if (yesterday?.overnight && currentMinutes < yesterday.closeMin) {
    return { isOpen: true, nextOpenAt: null };
  }

  const today = slotOf(openingHours, DAYS[currentDayIdx]);
  if (today) {
    const isOpen = today.overnight
      ? currentMinutes >= today.openMin
      : currentMinutes >= today.openMin && currentMinutes < today.closeMin;
    if (isOpen) return { isOpen: true, nextOpenAt: null };
    if (currentMinutes < today.openMin) {
      return { isOpen: false, nextOpenAt: today.label };
    }
  }

  for (let offset = 1; offset <= 7; offset++) {
    const key = DAYS[(currentDayIdx + offset) % 7];
    const slot = slotOf(openingHours, key);
    if (!slot) continue;
    return { isOpen: false, nextOpenAt: `${DAY_LABELS_FR[key]} ${slot.label}` };
  }

  return { isOpen: false, nextOpenAt: null };
}
