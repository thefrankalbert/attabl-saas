'use client';

import { useContext } from 'react';
import { PermissionsContext, type PermissionsContextValue } from '@/contexts/PermissionsContext';
import { ASSIGNMENT_MANAGER_ROLES, isRoleAllowed } from '@/lib/admin-roles';

export function usePermissions(): PermissionsContextValue {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}

/**
 * Assigner ou liberer un serveur sur une table: meme regle que le serveur
 * (actions/assignments.ts, DELETE /api/assignments/[id], policies "Floor
 * managers"): role de gerant ET `orders.manage`. Le plan de salle reste lisible
 * pour tous; seuls les gestes d'assignation sont caches.
 */
export function useCanManageFloor(): boolean {
  const { role, can } = usePermissions();
  return isRoleAllowed(role, ASSIGNMENT_MANAGER_ROLES) && can('orders.manage');
}
