'use client';

import { useMenuDetailState, type MenuDetailClientProps } from './use-menu-detail-state';
import { useMenuDetailActions } from './use-menu-detail-actions';
import { usePermissions } from '@/hooks/usePermissions';

export type { MenuDetailClientProps };

export function useMenuDetail(props: MenuDetailClientProps) {
  const state = useMenuDetailState(props);
  const actions = useMenuDetailActions(state);
  // Page ouverte a tout `menu.view`, mais chaque enregistrement exige `menu.edit`:
  // sans lui, la carte s'affiche en lecture seule au lieu d'un faux editeur.
  const canEdit = usePermissions().can('menu.edit');
  return { ...state, ...actions, canEdit };
}

export type MenuDetailVM = ReturnType<typeof useMenuDetail>;
