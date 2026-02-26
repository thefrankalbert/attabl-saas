'use client';

import { createContext, useContext, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useKeyboardShortcuts, type ShortcutDefinition } from '@/hooks/useKeyboardShortcuts';
import { ShortcutsHelp } from '@/components/features/shortcuts/ShortcutsHelp';

// ─── Types ──────────────────────────────────────────────

interface ShortcutsContextValue {
  helpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
  registerShortcuts: (defs: ShortcutDefinition[]) => () => void;
  getAllShortcuts: () => ShortcutDefinition[];
}

// ─── Context ────────────────────────────────────────────

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────

interface ShortcutsProviderProps {
  basePath: string;
  children: React.ReactNode;
}

export function ShortcutsProvider({ basePath, children }: ShortcutsProviderProps) {
  const router = useRouter();
  const t = useTranslations('shortcuts');
  const [helpOpen, setHelpOpen] = useState(false);

  // Contextual shortcuts registered by child components
  const contextualRef = useRef<Map<string, ShortcutDefinition>>(new Map());
  // Revision counter to trigger re-render when shortcuts change
  const [, setRevision] = useState(0);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  // ── Global navigation shortcuts (Go-sequences) ──
  const globalShortcuts = useMemo<ShortcutDefinition[]>(
    () => [
      {
        id: 'nav-dashboard',
        label: t('goToDashboard'),
        section: 'navigation',
        keys: ['g', 'd'],
        action: () => router.push(`${basePath}/dashboard`),
      },
      {
        id: 'nav-orders',
        label: t('goToOrders'),
        section: 'navigation',
        keys: ['g', 'o'],
        action: () => router.push(`${basePath}/orders`),
      },
      {
        id: 'nav-kitchen',
        label: t('goToKitchen'),
        section: 'navigation',
        keys: ['g', 'k'],
        action: () => router.push(`${basePath}/kitchen`),
      },
      {
        id: 'nav-pos',
        label: t('goToPOS'),
        section: 'navigation',
        keys: ['g', 'p'],
        action: () => router.push(`${basePath}/pos`),
      },
      {
        id: 'nav-settings',
        label: t('goToSettings'),
        section: 'navigation',
        keys: ['g', 's'],
        action: () => router.push(`${basePath}/settings`),
      },
    ],
    [basePath, router, t],
  );

  // ── Registration API ──
  const registerShortcuts = useCallback((defs: ShortcutDefinition[]) => {
    for (const def of defs) {
      contextualRef.current.set(def.id, def);
    }
    setRevision((r) => r + 1);

    return () => {
      for (const def of defs) {
        contextualRef.current.delete(def.id);
      }
      setRevision((r) => r + 1);
    };
  }, []);

  // ── Merged shortcuts for the hook ──
  const allShortcuts = useMemo(() => {
    const contextual = Array.from(contextualRef.current.values());
    return [...globalShortcuts, ...contextual];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalShortcuts, contextualRef.current.size]);

  const getAllShortcuts = useCallback((): ShortcutDefinition[] => {
    const contextual = Array.from(contextualRef.current.values());
    return [...globalShortcuts, ...contextual];
  }, [globalShortcuts]);

  // ── Mount the keyboard listener ──
  useKeyboardShortcuts({
    shortcuts: allShortcuts,
    onOpenHelp: openHelp,
  });

  const value = useMemo<ShortcutsContextValue>(
    () => ({
      helpOpen,
      openHelp,
      closeHelp,
      registerShortcuts,
      getAllShortcuts,
    }),
    [helpOpen, openHelp, closeHelp, registerShortcuts, getAllShortcuts],
  );

  return (
    <ShortcutsContext.Provider value={value}>
      {children}
      <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} shortcuts={getAllShortcuts()} />
    </ShortcutsContext.Provider>
  );
}

// ─── Consumer hook ──────────────────────────────────────

export function useShortcuts(): ShortcutsContextValue {
  const ctx = useContext(ShortcutsContext);
  if (!ctx) {
    throw new Error('useShortcuts must be used within a ShortcutsProvider');
  }
  return ctx;
}
