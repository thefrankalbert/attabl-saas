'use client';

import { useEffect } from 'react';
import { useShortcuts } from '@/contexts/ShortcutsContext';
import type { ShortcutDefinition } from '@/hooks/useKeyboardShortcuts';

/**
 * Register contextual shortcuts that are active only while the calling component is mounted.
 * Automatically unregisters on unmount.
 */
export function useContextualShortcuts(shortcuts: ShortcutDefinition[]) {
  const { registerShortcuts } = useShortcuts();

  useEffect(() => {
    if (shortcuts.length === 0) return;
    return registerShortcuts(shortcuts);
  }, [shortcuts, registerShortcuts]);
}
