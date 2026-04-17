import { describe, it, expect } from 'vitest';
import { computeOpeningState } from '../opening-hours';
import type { OpeningHoursMap } from '@/types/admin.types';

// Helper: build a Date for a given weekday (0=Sun..6=Sat) and HH:mm.
function dateAt(weekday: number, hour: number, minute: number): Date {
  // 2026-04-12 is a Sunday => offset by weekday days.
  const base = new Date(2026, 3, 12, hour, minute, 0, 0);
  base.setDate(base.getDate() + weekday);
  return base;
}

describe('computeOpeningState', () => {
  it('returns open when opening_hours is empty (24/7 backward compat)', () => {
    const result = computeOpeningState({}, dateAt(1, 3, 0));
    expect(result.isOpen).toBe(true);
    expect(result.nextOpenAt).toBeNull();
  });

  it('returns open when opening_hours is null', () => {
    const result = computeOpeningState(null, dateAt(2, 14, 0));
    expect(result.isOpen).toBe(true);
    expect(result.nextOpenAt).toBeNull();
  });

  it('returns open when current time is within todays slot', () => {
    const hours: OpeningHoursMap = {
      mon: { open: '09:00', close: '17:00' },
    };
    // Monday 12:30
    const result = computeOpeningState(hours, dateAt(1, 12, 30));
    expect(result.isOpen).toBe(true);
    expect(result.nextOpenAt).toBeNull();
  });

  it('returns closed before opening today and exposes todays open time', () => {
    const hours: OpeningHoursMap = {
      mon: { open: '09:00', close: '17:00' },
    };
    // Monday 07:30
    const result = computeOpeningState(hours, dateAt(1, 7, 30));
    expect(result.isOpen).toBe(false);
    expect(result.nextOpenAt).toBe('09:00');
  });

  it('returns closed after closing and falls through to next available day', () => {
    const hours: OpeningHoursMap = {
      mon: { open: '09:00', close: '17:00' },
      wed: { open: '10:00', close: '18:00' },
    };
    // Monday 18:00 -> next is Wednesday 10:00
    const result = computeOpeningState(hours, dateAt(1, 18, 0));
    expect(result.isOpen).toBe(false);
    expect(result.nextOpenAt).toBe('Mercredi 10:00');
  });

  it('handles closed day (key absent) and finds next opening day', () => {
    const hours: OpeningHoursMap = {
      mon: { open: '09:00', close: '17:00' },
      fri: { open: '11:00', close: '23:00' },
    };
    // Wednesday 12:00 - closed on wed, next is Friday
    const result = computeOpeningState(hours, dateAt(3, 12, 0));
    expect(result.isOpen).toBe(false);
    expect(result.nextOpenAt).toBe('Vendredi 11:00');
  });

  it('handles midnight edge case (00:00) before first opening', () => {
    const hours: OpeningHoursMap = {
      sun: { open: '08:00', close: '20:00' },
    };
    // Sunday 00:00 - before opening
    const result = computeOpeningState(hours, dateAt(0, 0, 0));
    expect(result.isOpen).toBe(false);
    expect(result.nextOpenAt).toBe('08:00');
  });

  it('returns closed at exactly close time (close is exclusive)', () => {
    const hours: OpeningHoursMap = {
      tue: { open: '09:00', close: '17:00' },
    };
    // Tuesday 17:00 sharp -> closed; next opening rolls to next Tuesday 09:00
    const result = computeOpeningState(hours, dateAt(2, 17, 0));
    expect(result.isOpen).toBe(false);
    expect(result.nextOpenAt).toBe('Mardi 09:00');
  });
});
