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

describe('normalisation des noms de pays', () => {
  it('apostrophe typographique, tirets, espaces et casse', () => {
    expect(resolveTenantTimezone({ country: 'C\u00f4te d\u2019Ivoire' })).toBe('Africa/Abidjan');
    expect(resolveTenantTimezone({ country: "  COTE-D'IVOIRE " })).toBe('Africa/Abidjan');
    expect(resolveTenantTimezone({ country: 'Burkina-Faso' })).toBe('Africa/Ouagadougou');
  });

  it('noms anglais et formes francaises longues', () => {
    expect(resolveTenantTimezone({ country: 'Cameroon' })).toBe('Africa/Douala');
    expect(resolveTenantTimezone({ country: 'Chad' })).toBe('Africa/Ndjamena');
    expect(resolveTenantTimezone({ country: 'Nigeria' })).toBe('Africa/Lagos');
    expect(resolveTenantTimezone({ country: 'Central African Republic' })).toBe('Africa/Bangui');
    expect(resolveTenantTimezone({ country: 'Equatorial Guinea' })).toBe('Africa/Malabo');
    expect(resolveTenantTimezone({ country: 'Ghana' })).toBe('Africa/Accra');
    expect(resolveTenantTimezone({ country: 'Ivory Coast' })).toBe('Africa/Abidjan');
    expect(resolveTenantTimezone({ country: 'RDC' })).toBe('Africa/Kinshasa');
    expect(resolveTenantTimezone({ country: 'DRC' })).toBe('Africa/Kinshasa');
    expect(resolveTenantTimezone({ country: 'Republique du Congo' })).toBe('Africa/Brazzaville');
    expect(resolveTenantTimezone({ country: 'Republique du Cameroun' })).toBe('Africa/Douala');
    expect(resolveTenantTimezone({ country: 'Guin\u00e9e \u00e9quatoriale' })).toBe(
      'Africa/Malabo',
    );
  });

  it('un UTC+0 dont la zone differe du defaut: Senegal -> Africa/Dakar', () => {
    expect(resolveTenantTimezone({ country: 'Senegal' })).toBe('Africa/Dakar');
  });

  it('nom inconnu -> zone par defaut', () => {
    expect(resolveTenantTimezone({ country: 'Atlantide' })).toBe('Africa/Abidjan');
  });

  it('getTenantMonthStart utilise la meme normalisation (nom de pays, UTC+1)', () => {
    const now = new Date('2026-04-19T14:00:00Z');
    expect(getTenantMonthStart({ country: 'Cameroun' }, now).toISOString()).toBe(
      '2026-03-31T23:00:00.000Z',
    );
    expect(getTenantMonthStart({ country: 'Cameroon' }, now).toISOString()).toBe(
      '2026-03-31T23:00:00.000Z',
    );
  });

  it('getTenantDayStart: reculer au-dela du debut de mois', () => {
    // 2026-03-02 12:00 UTC, Douala UTC+1: 5 jours avant = 25 fevrier local
    const now = new Date('2026-03-02T12:00:00Z');
    expect(getTenantDayStart({ country: 'Cameroun' }, 5, now).toISOString()).toBe(
      '2026-02-24T23:00:00.000Z',
    );
  });
});
