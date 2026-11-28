'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { logger } from '@/lib/logger';
import { nextOverride, posteLabelKey } from '@/lib/permission-catalogue-ui';
import type { PosteOverrides } from '@/lib/permissions';
import {
  POSTE_MATRIX,
  type PermissionCode,
  type PermissionMap,
  type StaffPoste,
} from '@/types/permission.types';

/** Valeur par defaut d'une case: seul le droit entier (`full`) compte comme "oui". */
export const posteDefault = (poste: StaffPoste, perm: PermissionCode): boolean =>
  POSTE_MATRIX[poste][perm] === 'full';

const DEBOUNCE_MS = 500;

export interface PermissionOverridesState {
  saving: boolean;
  posteOverrides: PosteOverrides;
  getEffectiveValue: (poste: StaffPoste, perm: PermissionCode) => boolean;
  hasOverrides: (poste: StaffPoste) => boolean;
  handleToggle: (poste: StaffPoste, perm: PermissionCode) => void;
  handleRestoreDefaults: (poste: StaffPoste) => Promise<void>;
}

/**
 * State of the owner's poste editor: the overrides on screen, and their saves
 * to /api/permissions. Owner decision: an edit takes effect on screen AND on
 * the server, so the screen never shows a state the server does not hold.
 */
export function usePermissionOverrides(initialOverrides: PosteOverrides): PermissionOverridesState {
  const { toast } = useToast();
  const t = useTranslations('permissions');
  const tu = useTranslations('users');

  const posteLabel = useCallback((poste: StaffPoste): string => tu(posteLabelKey(poste)), [tu]);

  // --- State ----------------------------------------
  const [saving, setSaving] = useState(false);

  // Poste overrides from DB: only stores diffs from defaults
  const [posteOverrides, setPosteOverrides] = useState<PosteOverrides>(initialOverrides);

  // Last state the server accepted, per poste. A failed save rolls the screen
  // back to it: the owner must never see a permission that is not in force.
  const savedOverrides = useRef<PosteOverrides>(initialOverrides);

  // Debounce timer per poste
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Saves of a poste run strictly one after the other (the server applies them
  // in the order the owner made them), and each edit gets a number so a failed
  // save can tell whether a newer edit exists.
  const saveQueue = useRef<Record<string, Promise<void>>>({});
  const lastEdit = useRef<Record<string, number>>({});

  const nextEdit = useCallback((poste: StaffPoste): number => {
    const seq = (lastEdit.current[poste] ?? 0) + 1;
    lastEdit.current[poste] = seq;
    return seq;
  }, []);

  const enqueueSave = useCallback((poste: StaffPoste, task: () => Promise<void>): Promise<void> => {
    const next = (saveQueue.current[poste] ?? Promise.resolve()).then(task);
    saveQueue.current[poste] = next;
    return next;
  }, []);

  // --- Effective Permission Value -------------------

  const getEffectiveValue = useCallback(
    (poste: StaffPoste, perm: PermissionCode): boolean => {
      // Check override first
      const override = posteOverrides[poste]?.[perm];
      if (override !== undefined) {
        return override;
      }
      // Fall back to default
      return posteDefault(poste, perm);
    },
    [posteOverrides],
  );

  // --- Has Overrides for Role -----------------------

  const hasOverrides = useCallback(
    (poste: StaffPoste): boolean => {
      const overrides = posteOverrides[poste];
      return !!overrides && Object.keys(overrides).length > 0;
    },
    [posteOverrides],
  );

  // --- Save Overrides to DB -------------------------

  const saveOverrides = useCallback(
    (poste: StaffPoste, overrides: PermissionMap, seq: number) =>
      enqueueSave(poste, async () => {
        setSaving(true);

        try {
          const hasKeys = Object.keys(overrides).length > 0;

          if (hasKeys) {
            const res = await fetch('/api/permissions', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ poste, permissions: overrides }),
            });
            if (!res.ok) {
              const data: { error?: string } = await res.json();
              throw new Error(data.error || t('saveError'));
            }
          } else {
            // No overrides: delete the row to fall back to defaults
            const res = await fetch('/api/permissions', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ poste }),
            });
            if (!res.ok) {
              const data: { error?: string } = await res.json();
              throw new Error(data.error || t('deleteError'));
            }
          }
          savedOverrides.current = { ...savedOverrides.current, [poste]: overrides };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : t('saveError');
          logger.error('Failed to save poste permissions', err, { poste });
          // A newer edit carries the whole poste state: its own save settles
          // the screen. Rolling back under it would hide an edit that still
          // reaches the server.
          if (seq === lastEdit.current[poste]) {
            setPosteOverrides((prev) => ({
              ...prev,
              [poste]: savedOverrides.current[poste] ?? {},
            }));
          }
          toast({
            title: `${message} (${posteLabel(poste)})`,
            variant: 'destructive',
          });
        }

        setSaving(false);
      }),
    [toast, t, posteLabel, enqueueSave],
  );

  // --- Toggle Permission ----------------------------

  const handleToggle = useCallback(
    (poste: StaffPoste, perm: PermissionCode) => {
      setPosteOverrides((prev) => {
        const currentOverrides = { ...(prev[poste] || {}) };

        // Retour au defaut: le reglage est retire. Une case bornee par defaut
        // ne revient pas au defaut en s'eteignant: elle ecrit `false`.
        const value = nextOverride(POSTE_MATRIX[poste][perm] ?? null, currentOverrides[perm]);
        if (value === undefined) delete currentOverrides[perm];
        else currentOverrides[perm] = value;

        const next = { ...prev, [poste]: currentOverrides };

        // Debounced save
        if (debounceTimers.current[poste]) {
          clearTimeout(debounceTimers.current[poste]);
        }
        const seq = nextEdit(poste);
        debounceTimers.current[poste] = setTimeout(() => {
          void saveOverrides(poste, currentOverrides, seq);
        }, DEBOUNCE_MS);

        return next;
      });
    },
    [saveOverrides, nextEdit],
  );

  // --- Restore Defaults -----------------------------

  const handleRestoreDefaults = useCallback(
    (poste: StaffPoste) => {
      // A toggle still waiting for its debounce would land AFTER the restore
      // and silently re-apply overrides the screen no longer shows.
      clearTimeout(debounceTimers.current[poste]);
      const seq = nextEdit(poste);

      return enqueueSave(poste, async () => {
        setSaving(true);

        try {
          const res = await fetch('/api/permissions', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poste }),
          });
          if (!res.ok) {
            const data: { error?: string } = await res.json();
            throw new Error(data.error || t('restoreError'));
          }

          savedOverrides.current = { ...savedOverrides.current, [poste]: {} };
          // A toggle made while the restore was in flight is queued after it
          // and carries its own state: leave it on screen.
          if (seq === lastEdit.current[poste]) {
            setPosteOverrides((prev) => {
              const next = { ...prev };
              delete next[poste];
              return next;
            });
          }
          toast({ title: t('restoreSuccess', { poste: posteLabel(poste) }) });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : t('restoreError');
          logger.error('Failed to restore defaults', err, { poste });
          // The pending toggle was cancelled: show what the server holds.
          if (seq === lastEdit.current[poste]) {
            setPosteOverrides((prev) => ({
              ...prev,
              [poste]: savedOverrides.current[poste] ?? {},
            }));
          }
          toast({
            title: message,
            variant: 'destructive',
          });
        }

        setSaving(false);
      });
    },
    [toast, t, posteLabel, nextEdit, enqueueSave],
  );

  // --- Cleanup Timers -------------------------------

  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      for (const key of Object.keys(timers)) {
        clearTimeout(timers[key]);
      }
    };
  }, []);

  return {
    saving,
    posteOverrides,
    getEffectiveValue,
    hasOverrides,
    handleToggle,
    handleRestoreDefaults,
  };
}
