import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

/** Echappe les jokers de ILIKE pour une comparaison de nom exacte. */
function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Vrai quand un restaurant ETABLI d'un autre groupe porte deja ce nom (meme regle
 * que le declencheur enforce_tenant_name_cross_group_unique: nom compare sans
 * casse ni espaces de bord, restaurants supprimes ignores, seuls les etablis
 * reservent un nom).
 *
 * Lu AVANT toute creation de compte (A-08): le refus "nom pris" doit tomber
 * avant la creation de l'utilisateur auth, sinon il ne se produit que pour une
 * adresse nouvelle et redevient un oracle d'enumeration des comptes. En cas
 * d'erreur de lecture on laisse passer: le declencheur en base reste la garde.
 */
export async function isRestaurantNameTaken(
  supabase: SupabaseClient,
  name: string,
): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;

  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .is('deleted_at', null)
    .eq('onboarding_completed', true)
    .not('group_id', 'is', null)
    .ilike('name', escapeIlike(trimmed))
    .limit(1);

  if (error) {
    logger.warn('isRestaurantNameTaken: lecture impossible, le declencheur en base decide', {
      error: error.message,
    });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}
