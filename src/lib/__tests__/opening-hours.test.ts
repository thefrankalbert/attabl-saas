import { describe, it, expect } from 'vitest';
import { computeOpeningState, localClock, openingMinutesForDay } from '../opening-hours';
import type { OpeningHoursMap } from '@/types/admin.types';

// Helper: the instant at a given weekday (0=Sun..6=Sat) and HH:mm UTC.
// Assertions use Africa/Abidjan (UTC+0, no DST), so local = UTC there.
function dateAt(weekday: number, hour: number, minute: number): Date {
  // 2026-04-12 is a Sunday => offset by weekday days.
  const base = new Date(Date.UTC(2026, 3, 12, hour, minute));
  base.setUTCDate(base.getUTCDate() + weekday);
  return base;
}
const ABIDJAN = 'Africa/Abidjan';

describe('computeOpeningState', () => {
  it('returns open when opening_hours is empty (24/7 backward compat)', () => {
    const result = computeOpeningState({}, dateAt(1, 3, 0), ABIDJAN);
    expect(result.isOpen).toBe(true);
    expect(result.nextOpenAt).toBeNull();
  });

  it('returns open when opening_hours is null', () => {
    const result = computeOpeningState(null, dateAt(2, 14, 0), ABIDJAN);
    expect(result.isOpen).toBe(true);
    expect(result.nextOpenAt).toBeNull();
  });

  it('returns open when current time is within todays slot', () => {
    const hours: OpeningHoursMap = {
      mon: { open: '09:00', close: '17:00' },
    };
    // Monday 12:30
    const result = computeOpeningState(hours, dateAt(1, 12, 30), ABIDJAN);
    expect(result.isOpen).toBe(true);
    expect(result.nextOpenAt).toBeNull();
  });

  it('returns closed before opening today and exposes todays open time', () => {
    const hours: OpeningHoursMap = {
      mon: { open: '09:00', close: '17:00' },
    };
    // Monday 07:30
    const result = computeOpeningState(hours, dateAt(1, 7, 30), ABIDJAN);
    expect(result.isOpen).toBe(false);
    expect(result.nextOpenAt).toBe('09:00');
  });

  it('returns closed after closing and falls through to next available day', () => {
    const hours: OpeningHoursMap = {
      mon: { open: '09:00', close: '17:00' },
      wed: { open: '10:00', close: '18:00' },
    };
    // Monday 18:00 -> next is Wednesday 10:00
    const result = computeOpeningState(hours, dateAt(1, 18, 0), ABIDJAN);
    expect(result.isOpen).toBe(false);
    expect(result.nextOpenAt).toBe('Mercredi 10:00');
  });

  it('handles closed day (key absent) and finds next opening day', () => {
    const hours: OpeningHoursMap = {
      mon: { open: '09:00', close: '17:00' },
      fri: { open: '11:00', close: '23:00' },
    };
    // Wednesday 12:00 - closed on wed, next is Friday
    const result = computeOpeningState(hours, dateAt(3, 12, 0), ABIDJAN);
    expect(result.isOpen).toBe(false);
    expect(result.nextOpenAt).toBe('Vendredi 11:00');
  });

  it('handles midnight edge case (00:00) before first opening', () => {
    const hours: OpeningHoursMap = {
      sun: { open: '08:00', close: '20:00' },
    };
    // Sunday 00:00 - before opening
    const result = computeOpeningState(hours, dateAt(0, 0, 0), ABIDJAN);
    expect(result.isOpen).toBe(false);
    expect(result.nextOpenAt).toBe('08:00');
  });

  it('returns closed at exactly close time (close is exclusive)', () => {
    const hours: OpeningHoursMap = {
      tue: { open: '09:00', close: '17:00' },
    };
    // Tuesday 17:00 sharp -> closed; next opening rolls to next Tuesday 09:00
    const result = computeOpeningState(hours, dateAt(2, 17, 0), ABIDJAN);
    expect(result.isOpen).toBe(false);
    expect(result.nextOpenAt).toBe('Mardi 09:00');
  });
});

describe('fuseau du restaurant (avant: horloge du serveur)', () => {
  const hours: OpeningHoursMap = { mon: { open: '18:00', close: '23:00' } };

  it('Douala (UTC+1): 17:30 UTC = 18:30 sur place, donc ouvert', () => {
    expect(computeOpeningState(hours, dateAt(1, 17, 30), 'Africa/Douala').isOpen).toBe(true);
  });

  it('temoin: le meme instant a Abidjan (UTC+0) = 17:30, donc ferme', () => {
    expect(computeOpeningState(hours, dateAt(1, 17, 30), ABIDJAN).isOpen).toBe(false);
  });

  it('localClock donne jour, minutes et date du restaurant', () => {
    // Lundi 23:30 UTC = mardi 00:30 a Douala.
    expect(localClock(dateAt(1, 23, 30), 'Africa/Douala')).toEqual({
      day: 2,
      minutes: 30,
      ymd: '2026-04-14',
    });
  });
});

describe('fermeture apres minuit (ex. maquis 18:00-02:00)', () => {
  const hours: OpeningHoursMap = { fri: { open: '18:00', close: '02:00' } };

  it('vendredi 23:00: ouvert (avant: ferme toute la soiree)', () => {
    expect(computeOpeningState(hours, dateAt(5, 23, 0), ABIDJAN).isOpen).toBe(true);
  });

  it('samedi 01:30: encore ouvert, la nuit de vendredi deborde', () => {
    expect(computeOpeningState(hours, dateAt(6, 1, 30), ABIDJAN).isOpen).toBe(true);
  });

  it('samedi 02:00: ferme', () => {
    expect(computeOpeningState(hours, dateAt(6, 2, 0), ABIDJAN).isOpen).toBe(false);
  });

  it('vendredi 17:00: ferme, ouvre a 18:00', () => {
    expect(computeOpeningState(hours, dateAt(5, 17, 0), ABIDJAN)).toEqual({
      isOpen: false,
      nextOpenAt: '18:00',
    });
  });
});

describe('openingMinutesForDay', () => {
  it('rend l heure d ouverture en minutes, null si ferme ce jour', () => {
    const hours: OpeningHoursMap = { mon: { open: '11:30', close: '15:00' } };
    expect(openingMinutesForDay(hours, 1)).toBe(690);
    expect(openingMinutesForDay(hours, 2)).toBeNull();
    expect(openingMinutesForDay(null, 1)).toBeNull();
  });
});
