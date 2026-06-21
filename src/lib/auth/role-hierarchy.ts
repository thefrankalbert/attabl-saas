import { AdminRole, ROLE_DESCRIPTIONS } from '@/types/admin.types';

/**
 * SECURITY: prevents privilege escalation. A granter can only assign a role
 * strictly below their own level. Owner may grant any role; admin may grant
 * roles below admin (manager and under) - never owner or admin.
 *
 * Single source of truth shared by every admin_users creation path (Server
 * Action actionCreateAdminUser AND the invitation API) so the two cannot
 * diverge on policy.
 */
export function canGrantRole(granterRole: string | null, targetRole: AdminRole): boolean {
  if (!granterRole) return false;
  if (granterRole === 'owner') return true;
  if (granterRole === 'admin') {
    return ROLE_DESCRIPTIONS[targetRole].level < ROLE_DESCRIPTIONS.admin.level;
  }
  return false;
}

/**
 * SECURITY: an actor may only mutate (update / disable / delete / reset / change
 * email of) a target whose role rank is STRICTLY below the actor's own. Without
 * this, an admin could disable, demote, delete or take over the owner account
 * (broken access control intra-tenant). Acting on a same-rank account (incl. the
 * actor's own) is also refused, which prevents self-lockout.
 */
export function canActOnUser(actorRole: string | null, targetRole: AdminRole): boolean {
  if (!actorRole) return false;
  const actorLevel = ROLE_DESCRIPTIONS[actorRole as AdminRole]?.level ?? 0;
  return actorLevel > ROLE_DESCRIPTIONS[targetRole].level;
}
