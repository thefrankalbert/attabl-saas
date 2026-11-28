import type { SupabaseClient } from '@supabase/supabase-js';
import { isoToZonedDay } from '@/lib/timezones';
import { ledgerValue } from '@/lib/orders/revenue';
import { logger } from '@/lib/logger';
import type { ServiceType } from '@/types/admin.types';

type LedgerEntry = {
  amount?: number | null;
  status?: string | null;
  created_at: string;
  order_id?: string | null;
};

type ChannelBucket = { date: string; surplace: number; emporter: number };

// Jours du graphique = jours DU RESTAURANT, comme les indicateurs du haut. Ils
// etaient en jour UTC (`toISOString().slice(0, 10)`): un paiement de 23 h a
// Paris tombait le lendemain (audit d'equipe du 2026-11-27, DASH-04).
export function buildChannelBuckets(
  payments: Array<LedgerEntry & { orders?: { service_type?: ServiceType | null } | null }>,
  dayStarts: Date[],
  tz: string,
): ChannelBucket[] {
  const buckets: Record<string, ChannelBucket> = {};
  for (const start of dayStarts) {
    const key = isoToZonedDay(start.toISOString(), tz);
    buckets[key] = { date: key, surplace: 0, emporter: 0 };
  }
  for (const p of payments) {
    const key = p.created_at ? isoToZonedDay(p.created_at, tz) : '';
    if (!key || !buckets[key]) continue;
    // Revenue split = money received that day, by the order's service mode.
    const amount = ledgerValue(p);
    const serviceType = p.orders?.service_type;
    // dine_in + room_service -> Sur place ; takeaway + delivery -> A emporter
    const emporter = serviceType === 'takeaway' || serviceType === 'delivery';
    if (emporter) buckets[key].emporter += amount;
    else buckets[key].surplace += amount;
  }
  return Object.values(buckets);
}

/** Taille d'une page PostgREST (plafond du projet: 1 000 lignes par requete). */
const PAGE_SIZE = 1000;

type ChartPayment = LedgerEntry & { orders?: { service_type?: ServiceType | null } | null };

/**
 * TOUS les paiements depuis `fromIso`, page par page. Une seule requete
 * plafonnait a 1 000 lignes sans message: au-dela, le graphique du chiffre
 * d'affaires etait faux (audit d'equipe du 2026-11-27, DASH-03).
 */
export async function fetchChartPayments(
  supabase: SupabaseClient,
  tenantId: string,
  fromIso: string,
): Promise<{ data: ChartPayment[] }> {
  const rows: ChartPayment[] = [];
  // Lecture en echec: graphique vide, jamais une exception. Elle ferait tomber
  // TOUS les indicateurs de la page, lus dans le meme Promise.all (contre-audit
  // du lot 4). Un graphique partiel serait faux: tout ou rien.
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('payments')
      .select('id, amount, status, created_at, orders(service_type)')
      .eq('tenant_id', tenantId)
      .gte('created_at', fromIso)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      logger.warn('Dashboard chart payments read failed', { tenantId, error: error.message });
      return { data: [] };
    }
    rows.push(...((data ?? []) as unknown as ChartPayment[]));
    if (!data || data.length < PAGE_SIZE) return { data: rows };
  }
}
