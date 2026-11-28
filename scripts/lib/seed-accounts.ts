// Nettoyage des comptes d'un restaurant de demonstration (seed-demo, seed-qa).
//
// POURQUOI CE FICHIER EXISTE. Les deux scripts supprimaient les comptes
// d'authentification trouves par EMAIL, avant de supprimer le restaurant. Deux
// defauts :
//
//  - la suppression du compte du proprietaire cascade vers sa ligne
//    `admin_users`, que la base refuse desormais tant que le restaurant existe
//    (declencheur `garder_proprietaire`) : le second lancement d'un seed
//    echouait ;
//  - une suppression decidee sur l'email seul detruit le compte d'une personne
//    qui porte le meme email dans un AUTRE restaurant.
//
// Regle : le restaurant d'abord (la cascade emporte ses membres, proprietaire
// compris), puis seulement les comptes qui n'appartiennent plus a aucun
// restaurant. Jamais de suppression decidee sur l'email seul.

import type { SupabaseClient } from '@supabase/supabase-js';

type Log = (message: string) => void;

/** Comptes (`auth.users`) des membres d'un restaurant, a lire AVANT de le supprimer. */
export async function listTenantMemberUserIds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`Lecture des membres impossible : ${error.message}`);
  return [...new Set((data ?? []).map((row) => row.user_id as string | null))].filter(
    (id): id is string => !!id,
  );
}

/** Restaurants ou ce compte a encore une ligne de membre. */
async function membershipSlugs(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('tenant_id, tenants(slug)')
    .eq('user_id', userId);
  if (error) throw new Error(`Lecture des appartenances impossible : ${error.message}`);
  return (data ?? []).map((row) => {
    const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
    return (tenant as { slug?: string } | null)?.slug ?? String(row.tenant_id);
  });
}

/**
 * Apres la suppression du restaurant : supprime chaque compte de la liste qui
 * n'a plus AUCUNE ligne de membre. Un compte encore membre ailleurs est garde.
 */
export async function deleteAccountsWithoutMembership(
  supabase: SupabaseClient,
  userIds: readonly string[],
  log: Log,
): Promise<void> {
  for (const userId of userIds) {
    const slugs = await membershipSlugs(supabase, userId);
    if (slugs.length > 0) {
      log(`  Compte ${userId} conserve : encore membre de ${slugs.join(', ')}`);
      continue;
    }
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw new Error(`Suppression du compte ${userId} impossible : ${error.message}`);
    log(`  Deleted auth user: ${userId}`);
  }
}

/**
 * Quand le restaurant du seed n'existe pas : un compte portant un email du seed
 * n'est supprime que s'il n'appartient a AUCUN restaurant. S'il est membre
 * d'un autre restaurant, le seed s'arrete et le nomme, sans rien supprimer.
 */
export async function deleteStraySeedAccounts(
  supabase: SupabaseClient,
  emails: readonly string[],
  log: Log,
): Promise<void> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Lecture des comptes impossible : ${error.message}`);
  const strays = (data?.users ?? []).filter((user) => !!user.email && emails.includes(user.email));

  // Tout verifier AVANT de supprimer quoi que ce soit : un arret au milieu
  // laisserait le jeu de comptes a moitie detruit.
  for (const user of strays) {
    const slugs = await membershipSlugs(supabase, user.id);
    if (slugs.length > 0) {
      throw new Error(
        `Le compte ${user.email} appartient au restaurant ${slugs.join(', ')} : le seed ne le supprime pas. Changez l'email du seed ou retirez ce membre a la main.`,
      );
    }
  }
  await deleteAccountsWithoutMembership(
    supabase,
    strays.map((user) => user.id),
    log,
  );
}
