'use client';

import { createContext, useMemo } from 'react';
import type { AdminRole } from '@/types/admin.types';
import type { PermissionCode } from '@/types/permission.types';

// --- Types ----------------------------------------------

export interface PermissionsContextValue {
  role: AdminRole;
  /** Permissions EFFECTIVES, resolues cote serveur comme pour les actions. */
  permissions: Record<PermissionCode, boolean>;
  can: (code: PermissionCode) => boolean;
}

// --- Context --------------------------------------------

export const PermissionsContext = createContext<PermissionsContextValue | null>(null);

// --- Provider -------------------------------------------

interface PermissionsProviderProps {
  role: AdminRole;
  /**
   * Resultat de `getEffectivePermissions` (defaut du role, surcharge du
   * proprietaire, surcharge individuelle). L'interface lit la MEME resolution
   * que le serveur: un reglage du proprietaire dans /settings/permissions
   * change donc aussi l'ecran.
   */
  permissions: Record<PermissionCode, boolean>;
  children: React.ReactNode;
}

export function PermissionsProvider({ role, permissions, children }: PermissionsProviderProps) {
  const value = useMemo(
    () => ({
      role,
      permissions,
      can: (code: PermissionCode) => permissions[code] === true,
    }),
    [role, permissions],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
