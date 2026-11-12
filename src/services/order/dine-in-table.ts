import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from '@/services/errors';

export type DineInTableProblem = 'TABLE_REQUIRED' | 'UNKNOWN_TABLE';

/**
 * Audit C-009 / C-061 (owner decision 2026-11-12): an order "sur place" must
 * name a table that exists and is active in THIS restaurant. Before, anyone
 * could open the restaurant's address and send a dine-in ticket without a
 * table (or with `?table=TAB-99`) straight to the kitchen. Takeaway, delivery
 * and room service are not concerned.
 *
 * Returns the problem instead of throwing, so the route can send a code the
 * storefront acts on (it forgets an unknown table and offers takeaway).
 */
export async function checkDineInTable(
  supabase: SupabaseClient,
  tenantId: string,
  serviceType: string,
  tableNumber: string | undefined,
): Promise<DineInTableProblem | null> {
  if (serviceType !== 'dine_in') return null;
  const table = tableNumber?.trim();
  if (!table) return 'TABLE_REQUIRED';

  const { data, error } = await supabase
    .from('tables')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('table_number', table)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new ServiceError('Erreur de verification de la table', 'INTERNAL', error);
  return data ? null : 'UNKNOWN_TABLE';
}
