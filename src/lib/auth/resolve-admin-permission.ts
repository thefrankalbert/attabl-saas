import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveMemberLevels } from '@/lib/auth/member-rights';
import {
  getEffectiveLevels,
  meetsRequirement,
  NO_LEVELS,
  toPermissionMap,
  toPostes,
  type PermissionLevels,
  type PermissionRequirement,
} from '@/lib/permissions';
import type { Poste } from '@/types/permission.types';

/**
 * Resolution UNIQUE de "cet utilisateur a-t-il cette permission dans ce tenant".
 *
 * POURQUOI CE FICHIER EXISTE. La meme regle etait ecrite trois fois - dans le
 * garde du middleware, dans le garde de page qui redirige, et dans sa jumelle
 * qui renvoie un booleen. Les trois copies avaient DERIVE, et pas sur des
 * details:
 *
 *   - deux d'entre elles ne filtraient ni `is_active` ni `deleted_at`, donc un
 *     membre suspendu ou supprime en douceur gardait son ancien role a leurs
 *     yeux;
 *   - une seule court-circuitait sur `is_super_admin` de la ligne de membre, si
 *     bien qu'un super-admin ayant aussi une ligne de membre a role faible
 *     etait autorise par le middleware et refuse par la page;
 *   - l'une utilisait `.single()` la ou l'autre utilisait `.maybeSingle()`, ce
 *     qui ne se comporte pas pareil quand un utilisateur a plusieurs lignes -
 *     exactement le cas d'un super-admin.
 *
 * Aucune de ces derives n'etait exploitable: le middleware couvre les 23 pages
 * gardees et le layout admin filtre les memberships morts pour toutes les
 * autres (verifie route par route). Mais une regle d'autorisation ecrite trois
 * fois finit par etre vraie deux fois sur trois, et la copie fautive est alors
 * la seule couche le jour ou une route echappe aux deux autres.
 *
 * La resolution reproduite ici est celle du garde du middleware, la plus
 * stricte des trois:
 *   1. membre VIVANT du tenant (`is_active`, pas de `deleted_at`) -> ses postes
 *      et son reglage par personne (`permission_overrides`) ;
 *   2. sinon super-admin plateforme VIVANT -> acces de proprietaire partout.
 *      Il est reconnu par `is_super_admin` OU par `role = 'super_admin'`, comme
 *      la fonction `is_super_admin()` de la base ;
 *   3. sinon refuse.
 *
 * Puis la resolution de `permissionLevel` : proprietaire, reglage par personne,
 * cumul des postes avec les reglages du restaurant.
 *
 * ECHEC FERME: toute erreur de resolution refuse l'acces.
 */
export interface AdminPermissionResolution {
  allowed: boolean;
  /**
   * Les postes retenus pour la decision: ceux du membre, ou `['owner']` pour un
   * super-admin. `null` quand l'utilisateur n'est ni l'un ni l'autre.
   */
  postes: Poste[] | null;
  /** Niveaux effectifs (aucun droit quand `postes` est `null`). */
  levels: PermissionLevels;
  /**
   * `admin_users.id` de la ligne retenue (celle du membre, ou la ligne de
   * plateforme du super-admin). Sert aux cles etrangeres (`invited_by`).
   */
  adminUserId: string | null;
}

const OWNER_POSTES: Poste[] = ['owner'];
const OWNER_LEVELS = getEffectiveLevels({ postes: OWNER_POSTES });

/** Un membre VIVANT du restaurant, avec ses droits effectifs. */
export interface LiveMember {
  /** `admin_users.id` de sa ligne dans ce restaurant. */
  adminUserId: string;
  postes: Poste[];
  isOwner: boolean;
  levels: PermissionLevels;
  /** Ligne de plateforme (`is_super_admin` ou `role = 'super_admin'`). */
  isPlatformRow: boolean;
}

/**
 * Le membre VIVANT (actif, non retire) de ce restaurant, ou `null`. SANS le
 * passe-droit du super-administrateur : a utiliser la ou seule une vraie ligne
 * de membre doit compter (abonnement, factures, invitations, prise en charge
 * d'une commande). `supabase` peut etre le client de session ou de service.
 */
export async function resolveLiveMember(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
): Promise<LiveMember | null> {
  // Seuls les memberships VIVANTS comptent: un membre banni (is_active=false)
  // ou supprime en douceur (deleted_at) doit etre refuse.
  const { data: adminData } = await supabase
    .from('admin_users')
    .select('id, postes, permission_overrides, is_super_admin, role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (!adminData) return null;

  const postes = toPostes(adminData.postes);
  const levels = await resolveMemberLevels(supabase, tenantId, {
    postes,
    permission_overrides: toPermissionMap(adminData.permission_overrides),
  });
  return {
    adminUserId: adminData.id,
    postes,
    isOwner: postes.includes('owner'),
    levels,
    // Transition: `role` ne sert plus qu'a reconnaitre la ligne de plateforme.
    isPlatformRow: adminData.is_super_admin === true || adminData.role === 'super_admin',
  };
}

export async function resolveAdminPermission(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  requirement: PermissionRequirement,
): Promise<AdminPermissionResolution> {
  const member = await resolveLiveMember(supabase, userId, tenantId);

  if (!member) {
    // Pas membre direct: on n'autorise que les super-admins plateforme VIVANTS.
    const { data: superAdmin } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', userId)
      .or('is_super_admin.eq.true,role.eq.super_admin')
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    return superAdmin
      ? { allowed: true, postes: OWNER_POSTES, levels: OWNER_LEVELS, adminUserId: superAdmin.id }
      : { allowed: false, postes: null, levels: NO_LEVELS, adminUserId: null };
  }

  if (member.isPlatformRow) {
    return {
      allowed: true,
      postes: OWNER_POSTES,
      levels: OWNER_LEVELS,
      adminUserId: member.adminUserId,
    };
  }

  return {
    allowed: meetsRequirement(member.levels, requirement),
    postes: member.postes,
    levels: member.levels,
    adminUserId: member.adminUserId,
  };
}
