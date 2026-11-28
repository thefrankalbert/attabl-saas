'use client';

import { createContext, useMemo } from 'react';
import {
  meetsRequirement,
  type PermissionLevels,
  type PermissionRequirement,
} from '@/lib/permissions';
import type { Poste } from '@/types/permission.types';

// --- Types ----------------------------------------------

export interface PermissionsContextValue {
  /** Postes cumules du membre. Sert a l'affichage, jamais a une garde. */
  postes: readonly Poste[];
  isOwner: boolean;
  /** Niveaux EFFECTIFS, resolus cote serveur comme pour les actions. */
  levels: PermissionLevels;
  /** Meme regle de garde que le serveur (`meetsRequirement`). */
  can: (requirement: PermissionRequirement) => boolean;
}

// --- Context --------------------------------------------

export const PermissionsContext = createContext<PermissionsContextValue | null>(null);

// --- Provider -------------------------------------------

interface PermissionsProviderProps {
  postes: readonly Poste[];
  /**
   * Resultat de `getEffectiveLevels` (cumul des postes, reglage du restaurant,
   * reglage par personne). L'interface lit la MEME resolution que le serveur :
   * un reglage du proprietaire change donc aussi l'ecran.
   */
  levels: PermissionLevels;
  children: React.ReactNode;
}

export function PermissionsProvider({ postes, levels, children }: PermissionsProviderProps) {
  const value = useMemo(
    () => ({
      postes,
      isOwner: postes.includes('owner'),
      levels,
      can: (requirement: PermissionRequirement) => meetsRequirement(levels, requirement),
    }),
    [postes, levels],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
