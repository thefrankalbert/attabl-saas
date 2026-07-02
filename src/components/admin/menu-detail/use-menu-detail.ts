'use client';

import { useMenuDetailState, type MenuDetailClientProps } from './use-menu-detail-state';
import { useMenuDetailActions } from './use-menu-detail-actions';

export type { MenuDetailClientProps };

export function useMenuDetail(props: MenuDetailClientProps) {
  const state = useMenuDetailState(props);
  const actions = useMenuDetailActions(state);
  return { ...state, ...actions };
}

export type MenuDetailVM = ReturnType<typeof useMenuDetail>;
