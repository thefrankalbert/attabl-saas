import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveTenantTimezone, zonedDayBounds } from '@/lib/timezones';
import { ServiceError } from './errors';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * B35: une date saisie sans heure (le formulaire n'envoie que `AAAA-MM-JJ`)
 * devient le debut (`valid_from`) ou la fin (`valid_until`) de ce jour dans le
 * fuseau du restaurant. Stockee telle quelle, la fin valait 00:00 UTC: le
 * coupon etait refuse tout son dernier jour. Un instant complet est garde.
 * Les coupons deja enregistres ne bougent pas. (Sorti de coupon.service.ts
 * pour le garder sous 400 lignes, contre-audit 3.)
 */
export async function zonedCouponValidity(
  supabase: SupabaseClient,
  tenantId: string,
  from: string | null | undefined,
  until: string | null | undefined,
): Promise<{ from: string | null | undefined; until: string | null | undefined }> {
  if (!(from && DATE_ONLY.test(from)) && !(until && DATE_ONLY.test(until))) {
    return { from, until };
  }
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('country')
    .eq('id', tenantId)
    .maybeSingle();
  // Contre-audit 2: une lecture en echec ne retombe pas sur le fuseau par
  // defaut (le coupon serait enregistre avec un decalage d'une heure ou
  // plus). Le repli ne vaut que pour un pays LU mais absent ou inconnu.
  if (tenantError) {
    throw new ServiceError('Lecture du restaurant impossible', 'INTERNAL', tenantError);
  }
  const tz = resolveTenantTimezone({
    country: (tenant as { country?: string | null } | null)?.country,
  });
  return {
    from: from && DATE_ONLY.test(from) ? (zonedDayBounds(from, tz)?.start ?? from) : from,
    until: until && DATE_ONLY.test(until) ? (zonedDayBounds(until, tz)?.end ?? until) : until,
  };
}
