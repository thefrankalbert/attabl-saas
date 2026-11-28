'use client';

import { useContext } from 'react';
import { PermissionsContext, type PermissionsContextValue } from '@/contexts/PermissionsContext';

export function usePermissions(): PermissionsContextValue {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}

/**
 * Assigner ou liberer un serveur sur une table: meme regle que le serveur
 * (actions/assignments.ts) et que la base (`has_tenant_floor_permission`): le
 * droit `settings.edit` ("Reglages du restaurant": tables, espaces). Le plan de
 * salle reste lisible pour tous; seuls les gestes d'assignation sont caches.
 */
export function useCanManageFloor(): boolean {
  return usePermissions().can('settings.edit');
}
