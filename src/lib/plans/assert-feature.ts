import type { SupabaseClient } from '@supabase/supabase-js';
import { canAccessFeature } from './features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

/** Les fonctionnalites que `canAccessFeature` sait arbitrer. */
export type GatedFeature = Parameters<typeof canAccessFeature>[0];

/**
 * Le tenant a-t-il droit a cette fonctionnalite, d'apres son plan ?
 *
 * Une Server Action est un endpoint POST adressable par son Action ID: gater la
 * PAGE ne gate pas la MUTATION. Un tenant Starter pouvait appeler directement
 * les actions du module Inventaire (fonctionnalite Pro) sans jamais voir l'ecran.
 * Cette fonction est le point de passage unique cote serveur, appele dans les
 * helpers de permission de chaque module plutot que dans chaque action - une
 * action ajoutee plus tard herite de la garde sans que personne y pense.
 */
export async function isFeatureEntitled(
  supabase: SupabaseClient,
  tenantId: string,
  feature: GatedFeature,
): Promise<boolean> {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('subscription_plan, subscription_status, trial_ends_at')
    .eq('id', tenantId)
    .maybeSingle();

  return canAccessFeature(
    feature,
    tenant?.subscription_plan as SubscriptionPlan | null,
    tenant?.subscription_status as SubscriptionStatus | null,
    tenant?.trial_ends_at ?? null,
  );
}
