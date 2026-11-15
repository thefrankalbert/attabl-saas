import type { SupabaseClient } from '@supabase/supabase-js';

/** Postgres `undefined_table` et son equivalent PostgREST: la migration n'est pas encore appliquee. */
const MISSING_TABLE_CODES = ['42P01', 'PGRST205'];

/**
 * Le restaurant est-il PAYE par Flutterwave en ce moment ? (une ligne reglee
 * dont la periode n'est pas finie.) Client service_role, requete filtree par restaurant.
 *
 * Le code part en production avant la migration (regle du depot): tant que la
 * table n'existe pas, personne n'a paye par Flutterwave, la reponse est `false`.
 * Toute autre erreur de lecture leve: l'appelant decide (refuser, ou faire
 * relancer le webhook).
 */
export async function hasActiveFlutterwavePeriod(
  supabase: SupabaseClient,
  tenantId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const { data, error } = await supabase
    .from('flutterwave_payments')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'successful')
    .gt('period_end', now.toISOString())
    .limit(1);
  if (error) {
    if (MISSING_TABLE_CODES.includes((error as { code?: string }).code ?? '')) return false;
    throw new Error('Lecture des paiements Flutterwave impossible');
  }
  return Array.isArray(data) && data.length > 0;
}
