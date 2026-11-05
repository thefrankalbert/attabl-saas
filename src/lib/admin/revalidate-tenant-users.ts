import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

/**
 * Invalide le cache de la page d'equipe d'un tenant apres une mutation de
 * membre (reserve S8' du contre-audit LOT 4: ce bloc etait recopie a
 * l'identique trois fois dans `src/app/actions/admin.ts`).
 *
 * Le chemin depend du slug du tenant, qui n'est pas connu de l'action: il est
 * relu en base. Pas d'erreur remontee: la mutation a deja reussi, une
 * revalidation ratee ne doit pas la transformer en echec cote client.
 */
export async function revalidateTenantUsersPath(
  adminClient: SupabaseClient,
  tenantId: string,
): Promise<void> {
  const { data: tenantData } = await adminClient
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .single();
  if (tenantData?.slug) {
    revalidatePath(`/sites/${tenantData.slug}/admin/users`);
  }
}
