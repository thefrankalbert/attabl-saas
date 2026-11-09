'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { logger } from '@/lib/logger';
import {
  DEFAULT_PERMISSIONS,
  type PermissionCode,
  type PermissionMap,
} from '@/types/permission.types';
import type { AdminRole } from '@/types/admin.types';

const DEBOUNCE_MS = 500;

export interface PermissionOverridesState {
  saving: boolean;
  roleOverrides: Record<string, PermissionMap>;
  getEffectiveValue: (role: AdminRole, perm: PermissionCode) => boolean;
  hasOverrides: (role: AdminRole) => boolean;
  handleToggle: (role: AdminRole, perm: PermissionCode) => void;
  handleRestoreDefaults: (role: AdminRole) => Promise<void>;
}

/**
 * State of the owner's role editor: the overrides on screen, and their saves
 * to /api/permissions. Owner decision: an edit takes effect on screen AND on
 * the server, so the screen never shows a state the server does not hold.
 */
export function usePermissionOverrides(
  tenantId: string,
  initialOverrides: Record<string, PermissionMap>,
): PermissionOverridesState {
  const { toast } = useToast();
  const t = useTranslations('permissions');

  const roleLabel = useCallback((role: string): string => t(`role.${role}`), [t]);

  // --- State ----------------------------------------
  const [saving, setSaving] = useState(false);

  // Role overrides from DB: only stores diffs from defaults
  const [roleOverrides, setRoleOverrides] =
    useState<Record<string, PermissionMap>>(initialOverrides);

  // Last state the server accepted, per role. A failed save rolls the screen
  // back to it: the owner must never see a permission that is not in force.
  const savedOverrides = useRef<Record<string, PermissionMap>>(initialOverrides);

  // Debounce timer per role
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Saves of a role run strictly one after the other (the server applies them
  // in the order the owner made them), and each edit gets a number so a failed
  // save can tell whether a newer edit exists.
  const saveQueue = useRef<Record<string, Promise<void>>>({});
  const lastEdit = useRef<Record<string, number>>({});

  const nextEdit = useCallback((role: string): number => {
    const seq = (lastEdit.current[role] ?? 0) + 1;
    lastEdit.current[role] = seq;
    return seq;
  }, []);

  const enqueueSave = useCallback((role: string, task: () => Promise<void>): Promise<void> => {
    const next = (saveQueue.current[role] ?? Promise.resolve()).then(task);
    saveQueue.current[role] = next;
    return next;
  }, []);

  // --- Effective Permission Value -------------------

  const getEffectiveValue = useCallback(
    (role: AdminRole, perm: PermissionCode): boolean => {
      // Check override first
      const override = roleOverrides[role]?.[perm];
      if (override !== undefined) {
        return override;
      }
      // Fall back to default
      return DEFAULT_PERMISSIONS[role]?.[perm] ?? false;
    },
    [roleOverrides],
  );

  // --- Has Overrides for Role -----------------------

  const hasOverrides = useCallback(
    (role: AdminRole): boolean => {
      const overrides = roleOverrides[role];
      return !!overrides && Object.keys(overrides).length > 0;
    },
    [roleOverrides],
  );

  // --- Save Overrides to DB -------------------------

  const saveOverrides = useCallback(
    (role: AdminRole, overrides: PermissionMap, seq: number) =>
      enqueueSave(role, async () => {
        setSaving(true);

        try {
          const hasKeys = Object.keys(overrides).length > 0;

          if (hasKeys) {
            const res = await fetch('/api/permissions', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tenant_id: tenantId, role: role, permissions: overrides }),
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
              body: JSON.stringify({ tenant_id: tenantId, role: role }),
            });
            if (!res.ok) {
              const data: { error?: string } = await res.json();
              throw new Error(data.error || t('deleteError'));
            }
          }
          savedOverrides.current = { ...savedOverrides.current, [role]: overrides };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : t('saveError');
          logger.error('Failed to save role permissions', err, { role });
          // A newer edit carries the whole role state: its own save settles
          // the screen. Rolling back under it would hide an edit that still
          // reaches the server.
          if (seq === lastEdit.current[role]) {
            setRoleOverrides((prev) => ({ ...prev, [role]: savedOverrides.current[role] ?? {} }));
          }
          toast({
            title: `${message} (${roleLabel(role)})`,
            variant: 'destructive',
          });
        }

        setSaving(false);
      }),
    [tenantId, toast, t, roleLabel, enqueueSave],
  );

  // --- Toggle Permission ----------------------------

  const handleToggle = useCallback(
    (role: AdminRole, perm: PermissionCode) => {
      const currentValue = getEffectiveValue(role, perm);
      const newValue = !currentValue;
      const defaultValue = DEFAULT_PERMISSIONS[role]?.[perm] ?? false;

      setRoleOverrides((prev) => {
        const currentRoleOverrides = { ...(prev[role] || {}) };

        if (newValue === defaultValue) {
          // Matches default: remove override
          delete currentRoleOverrides[perm];
        } else {
          // Differs from default: store override
          currentRoleOverrides[perm] = newValue;
        }

        const next = { ...prev, [role]: currentRoleOverrides };

        // Debounced save
        if (debounceTimers.current[role]) {
          clearTimeout(debounceTimers.current[role]);
        }
        const seq = nextEdit(role);
        debounceTimers.current[role] = setTimeout(() => {
          void saveOverrides(role, currentRoleOverrides, seq);
        }, DEBOUNCE_MS);

        return next;
      });
    },
    [getEffectiveValue, saveOverrides, nextEdit],
  );

  // --- Restore Defaults -----------------------------

  const handleRestoreDefaults = useCallback(
    (role: AdminRole) => {
      // A toggle still waiting for its debounce would land AFTER the restore
      // and silently re-apply overrides the screen no longer shows.
      clearTimeout(debounceTimers.current[role]);
      const seq = nextEdit(role);

      return enqueueSave(role, async () => {
        setSaving(true);

        try {
          const res = await fetch('/api/permissions', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenant_id: tenantId, role: role }),
          });
          if (!res.ok) {
            const data: { error?: string } = await res.json();
            throw new Error(data.error || t('restoreError'));
          }

          savedOverrides.current = { ...savedOverrides.current, [role]: {} };
          // A toggle made while the restore was in flight is queued after it
          // and carries its own state: leave it on screen.
          if (seq === lastEdit.current[role]) {
            setRoleOverrides((prev) => {
              const next = { ...prev };
              delete next[role];
              return next;
            });
          }
          toast({ title: t('restoreSuccess', { role: roleLabel(role) }) });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : t('restoreError');
          logger.error('Failed to restore defaults', err, { role });
          // The pending toggle was cancelled: show what the server holds.
          if (seq === lastEdit.current[role]) {
            setRoleOverrides((prev) => ({ ...prev, [role]: savedOverrides.current[role] ?? {} }));
          }
          toast({
            title: message,
            variant: 'destructive',
          });
        }

        setSaving(false);
      });
    },
    [tenantId, toast, t, roleLabel, nextEdit, enqueueSave],
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
    roleOverrides,
    getEffectiveValue,
    hasOverrides,
    handleToggle,
    handleRestoreDefaults,
  };
}
