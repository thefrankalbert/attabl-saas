import type { AdminRole } from '@/types/admin.types';

/**
 * Numeric rank per role (higher = more privileged). Single source of truth for
 * "who outranks whom" across every admin_users authorization check, kept local
 * to this module so it stays self-contained and cannot be swept as unused.
 */
const ROLE_RANK: Record<AdminRole, number> = {
  owner: 100,
  admin: 80,
  manager: 60,
  cashier: 50,
  chef: 40,
  waiter: 20,
};

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
    return ROLE_RANK[targetRole] < ROLE_RANK.admin;
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
  const actorRank = ROLE_RANK[actorRole as AdminRole] ?? 0;
  return actorRank > ROLE_RANK[targetRole];
}
