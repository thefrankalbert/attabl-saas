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

export function computeOpeningState(
  openingHours: OpeningHoursMap | null | undefined,
  now: Date,
): OpeningState {
  if (!openingHours || Object.keys(openingHours).length === 0) {
    return { isOpen: true, nextOpenAt: null };
  }

  const currentDayIdx = now.getDay();
  const currentDayKey = DAYS[currentDayIdx];
  const currentMinutes = toMinutes(now.getHours(), now.getMinutes());

  const todaySlot = openingHours[currentDayKey];
  if (todaySlot) {
    const open = parseHHmm(todaySlot.open);
    const close = parseHHmm(todaySlot.close);
    if (open && close) {
      const openMin = toMinutes(open.h, open.m);
      const closeMin = toMinutes(close.h, close.m);
      if (currentMinutes >= openMin && currentMinutes < closeMin) {
        return { isOpen: true, nextOpenAt: null };
      }
      if (currentMinutes < openMin) {
        return { isOpen: false, nextOpenAt: formatHHmm(open.h, open.m) };
      }
    }
  }

  for (let offset = 1; offset <= 7; offset++) {
    const idx = (currentDayIdx + offset) % 7;
    const key = DAYS[idx];
    const slot = openingHours[key];
    if (!slot) continue;
    const open = parseHHmm(slot.open);
    if (!open) continue;
    const time = formatHHmm(open.h, open.m);
    return { isOpen: false, nextOpenAt: `${DAY_LABELS_FR[key]} ${time}` };
  }

  return { isOpen: false, nextOpenAt: null };
}
