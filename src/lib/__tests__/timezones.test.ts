import { describe, it, expect } from 'vitest';
import { getTenantDayStart, getTenantMonthStart, resolveTenantTimezone } from '../timezones';

describe('resolveTenantTimezone', () => {
  it('returns the Douala zone for Cameroun (CM)', () => {
    expect(resolveTenantTimezone({ country: 'CM' })).toBe('Africa/Douala');
  });

  it('is case-insensitive', () => {
    expect(resolveTenantTimezone({ country: 'ci' })).toBe('Africa/Abidjan');
  });

  it('falls back to Africa/Abidjan when country is missing', () => {
    expect(resolveTenantTimezone({})).toBe('Africa/Abidjan');
  });

  it('falls back to Africa/Abidjan for unknown countries', () => {
    expect(resolveTenantTimezone({ country: 'ZZ' })).toBe('Africa/Abidjan');
  });
});

describe('getTenantMonthStart', () => {
  it('returns the first day of the month at 00:00 local for a UTC-0 country', () => {
    // 2026-04-19 14:00 UTC - April's start in Abidjan is 2026-04-01T00:00:00Z
    const now = new Date('2026-04-19T14:00:00Z');
    const start = getTenantMonthStart({ country: 'CI' }, now);
    // Abidjan = UTC+0 → 01 at 00:00 local = 01 at 00:00 UTC
    expect(start.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('shifts the UTC instant for UTC+1 countries', () => {
    // Cameroun = WAT, UTC+1, no DST → 01 at 00:00 local = 31 at 23:00 UTC
    const now = new Date('2026-04-19T14:00:00Z');
    const start = getTenantMonthStart({ country: 'CM' }, now);
    expect(start.toISOString()).toBe('2026-03-31T23:00:00.000Z');
  });

  it('uses the fallback timezone when country is missing', () => {
    const now = new Date('2026-04-19T14:00:00Z');
    const start = getTenantMonthStart({}, now);
    expect(start.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
});

describe('resolveTenantTimezone - noms de pays', () => {
  it('reconnait Cameroun et Tchad (UTC+1) par leur nom, accents et casse ignores', () => {
    expect(resolveTenantTimezone({ country: 'Cameroun' })).toBe('Africa/Douala');
    expect(resolveTenantTimezone({ country: 'tchad' })).toBe('Africa/Ndjamena');
    expect(resolveTenantTimezone({ country: "Cote d'Ivoire" })).toBe('Africa/Abidjan');
    expect(resolveTenantTimezone({ country: 'Burkina Faso' })).toBe('Africa/Ouagadougou');
  });
});

describe('getTenantDayStart', () => {
  // 2026-04-19 23:30 UTC = 00:30 le 20 avril a Douala (UTC+1)
  const now = new Date('2026-04-19T23:30:00Z');

  it('UTC+1: la journee du 20 avril commence le 19 a 23:00 UTC', () => {
    expect(getTenantDayStart({ country: 'Cameroun' }, 0, now).toISOString()).toBe(
      '2026-04-19T23:00:00.000Z',
    );
  });

  it('temoin: UTC+0, il est encore le 19 avril', () => {
    expect(getTenantDayStart({ country: 'Burkina Faso' }, 0, now).toISOString()).toBe(
      '2026-04-19T00:00:00.000Z',
    );
  });

  it('daysAgo recule de jours calendaires locaux', () => {
    expect(getTenantDayStart({ country: 'Cameroun' }, 1, now).toISOString()).toBe(
      '2026-04-18T23:00:00.000Z',
    );
  });
});
