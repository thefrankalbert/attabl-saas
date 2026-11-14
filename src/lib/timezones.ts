/**
 * Tenant timezone resolution.
 *
 * The `tenants` table has no `timezone` column today. This helper derives a
 * reasonable IANA timezone string from the tenant's `country` (which IS on
 * the schema, see src/lib/cache.ts:42) so that month-start boundaries align
 * with local time rather than server UTC.
 *
 * Dominant ATTABL tenant geography: francophone West/Central Africa.
 * Fallback: `Africa/Abidjan` (UTC+0, matches Greenwich, no DST).
 */

const COUNTRY_TZ: Record<string, string> = {
  // Central Africa (WAT, UTC+1)
  CM: 'Africa/Douala', // Cameroun
  TD: 'Africa/Ndjamena', // Tchad
  CF: 'Africa/Bangui', // Centrafrique
  CD: 'Africa/Kinshasa', // RDC (partie ouest)
  CG: 'Africa/Brazzaville', // Congo
  GA: 'Africa/Libreville', // Gabon
  GQ: 'Africa/Malabo', // Guinée équatoriale
  NE: 'Africa/Niamey', // Niger
  NG: 'Africa/Lagos', // Nigeria

  // West Africa (GMT, UTC+0)
  CI: 'Africa/Abidjan', // Côte d'Ivoire
  SN: 'Africa/Dakar', // Sénégal
  BF: 'Africa/Ouagadougou', // Burkina Faso
  ML: 'Africa/Bamako', // Mali
  GN: 'Africa/Conakry', // Guinée
  GH: 'Africa/Accra', // Ghana
  TG: 'Africa/Lome', // Togo
  BJ: 'Africa/Porto-Novo', // Bénin
  MR: 'Africa/Nouakchott', // Mauritanie

  // East Africa (EAT, UTC+3)
  RW: 'Africa/Kigali',
  BI: 'Africa/Bujumbura',
  KE: 'Africa/Nairobi',
  UG: 'Africa/Kampala',
  TZ: 'Africa/Dar_es_Salaam',

  // Europe (selection)
  FR: 'Europe/Paris',
  BE: 'Europe/Brussels',
  LU: 'Europe/Luxembourg',
  CH: 'Europe/Zurich',

  // North America (selection)
  US: 'America/New_York',
  CA: 'America/Toronto',
};

const DEFAULT_TIMEZONE = 'Africa/Abidjan';

// `tenants.country` stocke un NOM de pays (defaut 'Cameroun', onboarding
// 'Burkina Faso'), pas un code ISO: sans cette table, un restaurant de
// Cameroun ou du Tchad (UTC+1) tombait sur la zone par defaut (UTC+0) et son
// "aujourd'hui" basculait une heure trop tard (audit R-02).
const NAME_TO_CODE: Record<string, string> = {
  CAMEROUN: 'CM',
  TCHAD: 'TD',
  CENTRAFRIQUE: 'CF',
  CONGO: 'CG',
  GABON: 'GA',
  "COTE D'IVOIRE": 'CI',
  SENEGAL: 'SN',
  'BURKINA FASO': 'BF',
  MALI: 'ML',
  GUINEE: 'GN',
  TOGO: 'TG',
  BENIN: 'BJ',
  NIGER: 'NE',
  FRANCE: 'FR',
};

function normalizeCountry(raw: string): string {
  const up = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
  return NAME_TO_CODE[up] ?? up;
}

/** Resolve an IANA timezone for the given tenant (or fall back to the default). */
export function resolveTenantTimezone(tenant: { country?: string | null }): string {
  if (!tenant.country) return DEFAULT_TIMEZONE;
  const code = normalizeCountry(tenant.country);
  return COUNTRY_TZ[code] ?? DEFAULT_TIMEZONE;
}

const OFFSET_RE = /(?:GMT|UTC)\s*([+-])?(\d{1,2})(?::?(\d{2}))?/;

/**
 * Return the IANA tz offset (in minutes, positive east of GMT) that applies
 * at the given instant. Uses Intl's `longOffset` token (Node 20+, all modern
 * browsers). Falls back to 0 if the platform reports an unexpected shape.
 */
function tzOffsetMinutes(tz: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    }).formatToParts(at);
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    const match = raw.match(OFFSET_RE);
    if (!match) return 0;
    const sign = match[1] === '-' ? -1 : 1;
    const h = Number(match[2] || 0);
    const m = Number(match[3] || 0);
    return sign * (h * 60 + m);
  } catch {
    return 0;
  }
}

/**
 * Compute a Date representing the first day of the current month at 00:00
 * in the tenant's local timezone, serialised back to an absolute instant.
 *
 * Equivalent to `startOfMonth(now, tenantTz)` in tz-aware date-fns.
 */
export function getTenantMonthStart(tenant: { country?: string | null }, now = new Date()): Date {
  const tz = resolveTenantTimezone(tenant);
  // Year + month in the target timezone at the current instant.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  if (!year || !month) {
    const d = new Date(now);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  // "Naive" UTC instant at month-start. Subtract the tz offset so the same
  // absolute instant maps to 00:00 local time. (UTC+1 → -60min)
  const naiveStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const offset = tzOffsetMinutes(tz, naiveStart);
  return new Date(naiveStart.getTime() - offset * 60 * 1000);
}

/**
 * Debut de journee (00:00 locale du restaurant) `daysAgo` jours avant `now`,
 * serialise en instant absolu. Remplace `setHours(0, 0, 0, 0)`, qui prenait
 * minuit du serveur (UTC sur Vercel) cote page et minuit de l'appareil cote
 * client: deux "aujourd'hui" differents pour le meme restaurant (audit R-02).
 * Decision: la journee de caisse est celle du restaurant, deduite de son pays
 * (pas de colonne fuseau en base), repli Africa/Abidjan.
 */
export function getTenantDayStart(
  tenant: { country?: string | null },
  daysAgo = 0,
  now = new Date(),
): Date {
  return getDayStartInZone(resolveTenantTimezone(tenant), daysAgo, now);
}

/** Meme calcul a partir d'un fuseau IANA deja resolu (cote client). */
export function getDayStartInZone(tz: string, daysAgo = 0, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  if (!year || !month || !day) {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const naiveStart = new Date(Date.UTC(year, month - 1, day - daysAgo, 0, 0, 0, 0));
  const offset = tzOffsetMinutes(tz, naiveStart);
  return new Date(naiveStart.getTime() - offset * 60 * 1000);
}
