import { createAdminClient } from '@/lib/supabase/admin';

export type TenantBillingIds = {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

/**
 * Identifiants Stripe d'un restaurant, lus avec le client service_role.
 *
 * POURQUOI LE SERVICE_ROLE. Le role `authenticated` n'a plus le droit de lire
 * `stripe_customer_id` ni `stripe_subscription_id` sur `tenants`: la policy
 * "Public can read active tenants" laissait tout utilisateur connecte lire les
 * identifiants Stripe de TOUS les restaurants. Une requete client utilisateur
 * sur ces colonnes (embed `tenants(...)` compris) repond donc "permission
 * denied".
 *
 * CONTRAT. Ce helper ne verifie RIEN: le service_role ignore le RLS. L'appelant
 * DOIT avoir verifie avant, avec le client de session, que l'utilisateur est
 * membre (avec le bon role) de `tenantId`. Ne jamais passer un id venu du
 * client sans cette verification.
 *
 * Une erreur de lecture est levee, pas convertie en "aucun abonnement": sur une
 * panne, conclure "pas d'abonnement" pousserait a en ouvrir un second.
 *
 * @returns `null` si le restaurant n'existe pas.
 */
export async function getTenantBillingIds(tenantId: string): Promise<TenantBillingIds | null> {
  const { data, error } = await createAdminClient()
    .from('tenants')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('id', tenantId)
    .maybeSingle<TenantBillingIds>();

  if (error) {
    throw new Error(`Lecture des identifiants Stripe impossible: ${error.message}`);
  }
  return data;
}
