import type { SupabaseClient } from '@supabase/supabase-js';

import { logger } from '@/lib/logger';
import {
  getEffectiveLevels,
  getFailClosedLevels,
  isOwner,
  toPermissionMap,
  type MemberRights,
  type PermissionLevels,
  type PosteOverrides,
} from '@/lib/permissions';
import type { StaffPoste } from '@/types/permission.types';

/**
 * Reglages du restaurant pour les postes d'un membre (`poste_permissions`).
 *
 * Lit TOUS les postes du membre en une requete : avec le cumul, un seul poste
 * ne suffit plus a decider. `failed` vaut vrai quand la lecture a echoue ;
 * l'appelant doit alors refuser tout ce que ces reglages auraient pu trancher
 * (voir `resolveMemberLevels`).
 */
export async function loadPosteOverrides(
  supabase: SupabaseClient,
  tenantId: string,
  postes: readonly string[],
): Promise<{ overrides: PosteOverrides; failed: boolean }> {
  const staff = postes.filter((poste) => poste !== 'owner');
  if (staff.length === 0) return { overrides: {}, failed: false };

  const { data, error } = await supabase
    .from('poste_permissions')
    .select('poste, permissions')
    .eq('tenant_id', tenantId)
    .in('poste', staff);

  if (error) {
    logger.error('poste_permissions read failed (fail-closed)', error, { tenantId });
    return { overrides: {}, failed: true };
  }

  const overrides: PosteOverrides = {};
  for (const row of (data ?? []) as { poste: string; permissions: unknown }[]) {
    const map = toPermissionMap(row.permissions);
    if (map) overrides[row.poste as StaffPoste] = map;
  }
  return { overrides, failed: false };
}

/**
 * Niveaux effectifs d'un membre dans un restaurant : la resolution UNIQUE du
 * serveur (actions, routes, pages, middleware).
 *
 * ECHEC FERME. Si la lecture des reglages du restaurant echoue, seuls le
 * proprietaire et les reglages par personne decident ; le reste est refuse. Une
 * panne retombait autrefois sur la matrice par defaut et REACCORDAIT un droit
 * que le restaurant avait retire.
 */
export async function resolveMemberLevels(
  supabase: SupabaseClient,
  tenantId: string,
  member: MemberRights,
): Promise<PermissionLevels> {
  if (isOwner(member)) return getEffectiveLevels(member);
  const { overrides, failed } = await loadPosteOverrides(supabase, tenantId, member.postes);
  return failed ? getFailClosedLevels(member) : getEffectiveLevels(member, overrides);
}
