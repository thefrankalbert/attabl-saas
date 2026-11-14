import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { ServiceError } from './errors';

/**
 * Vrai quand un restaurant ETABLI d'un autre groupe porte deja ce nom.
 *
 * Le predicat vit en base (RPC is_tenant_name_taken, copie exacte de celui du
 * declencheur enforce_tenant_name_cross_group_unique): une copie cote application
 * divergeait. Lu AVANT toute creation de compte (A-08): le refus "nom pris" doit
 * tomber avant la creation de l'utilisateur auth, sinon il ne se produit que pour
 * une adresse nouvelle et redevient un oracle d'enumeration des comptes.
 *
 * Echoue FERME: si la lecture est impossible on leve, et l'appelant repond la
 * meme indisponibilite temporaire quelle que soit l'adresse (jamais un passage
 * silencieux, qui rouvrirait l'oracle pendant une panne).
 */
export async function isRestaurantNameTaken(
  supabase: SupabaseClient,
  name: string,
): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;

  const { data, error } = await supabase.rpc('is_tenant_name_taken', { p_name: trimmed });
  if (error || typeof data !== 'boolean') {
    logger.error('isRestaurantNameTaken: lecture impossible', { error: error?.message });
    throw new ServiceError('Verification du nom impossible', 'INTERNAL', error);
  }
  return data;
}
