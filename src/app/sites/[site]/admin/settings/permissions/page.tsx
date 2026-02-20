'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldCheck, RotateCcw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import {
  DEFAULT_PERMISSIONS,
  type PermissionCode,
  type PermissionMap,
} from '@/types/permission.types';
import type { AdminRole } from '@/types/admin.types';

// ─── Constants ────────────────────────────────────────

const EDITABLE_ROLES: AdminRole[] = ['admin', 'manager', 'cashier', 'chef', 'waiter'];

const DEBOUNCE_MS = 500;

// Permission categories for grouped display
interface PermissionCategory {
  key: string;
  permissions: PermissionCode[];
}

const PERMISSION_CATEGORIES: PermissionCategory[] = [
  { key: 'menu', permissions: ['menu.view', 'menu.edit'] },
  { key: 'orders', permissions: ['orders.view', 'orders.manage'] },
  { key: 'reports', permissions: ['reports.view'] },
  { key: 'pos', permissions: ['pos.use'] },
  { key: 'inventory', permissions: ['inventory.view', 'inventory.edit'] },
  { key: 'team', permissions: ['team.view', 'team.manage'] },
  { key: 'settings', permissions: ['settings.view', 'settings.edit'] },
];

// ─── Component ────────────────────────────────────────

export default function PermissionsPage() {
  const supabase = createClient();
  const { toast } = useToast();
  const t = useTranslations('permissions');

  // ─── State ────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Role overrides from DB: only stores diffs from defaults
  const [roleOverrides, setRoleOverrides] = useState<Record<string, PermissionMap>>({});

  // Debounce timer per role
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ─── i18n Helpers ───────────────────────────────────

  const permissionLabel = useCallback(
    (perm: PermissionCode): string => {
      const key = perm.replace('.', '_') as 'menu_view';
      return t(`perm.${key}`);
    },
    [t],
  );

  const roleLabel = useCallback(
    (role: string): string => {
      return t(`role.${role}`);
    },
    [t],
  );

  const categoryLabel = useCallback(
    (categoryKey: string): string => {
      return t(`category.${categoryKey}`);
    },
    [t],
  );

  // ─── Initialization ───────────────────────────────

  useEffect(() => {
    const init = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      // Check role - must be owner
      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('tenant_id, role')
        .eq('user_id', user.id)
        .single();

      if (!adminUser || adminUser.role !== 'owner') {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      const tId = adminUser.tenant_id as string;
      setTenantId(tId);

      // Fetch existing role overrides
      const { data: rolePerms, error } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('tenant_id', tId);

      if (error) {
        logger.error('Failed to load role permissions', { error });
        toast({
          title: t('loadError'),
          variant: 'destructive',
        });
      }

      // Build overrides map
      const overrides: Record<string, PermissionMap> = {};
      if (rolePerms) {
        for (const rp of rolePerms) {
          const role = rp.role as string;
          const perms = rp.permissions as PermissionMap | null;
          if (perms && Object.keys(perms).length > 0) {
            overrides[role] = perms;
          }
        }
      }

      setRoleOverrides(overrides);
      setLoading(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Effective Permission Value ───────────────────

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

  // ─── Has Overrides for Role ───────────────────────

  const hasOverrides = useCallback(
    (role: AdminRole): boolean => {
      const overrides = roleOverrides[role];
      return !!overrides && Object.keys(overrides).length > 0;
    },
    [roleOverrides],
  );

  // ─── Save Overrides to DB ─────────────────────────

  const saveOverrides = useCallback(
    async (role: AdminRole, overrides: PermissionMap) => {
      if (!tenantId) return;

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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('saveError');
        logger.error('Failed to save role permissions', err, { role });
        toast({
          title: `${message} (${roleLabel(role)})`,
          variant: 'destructive',
        });
      }

      setSaving(false);
    },
    [tenantId, toast, t, roleLabel],
  );

  // ─── Toggle Permission ────────────────────────────

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
        debounceTimers.current[role] = setTimeout(() => {
          saveOverrides(role, currentRoleOverrides);
        }, DEBOUNCE_MS);

        return next;
      });
    },
    [getEffectiveValue, saveOverrides],
  );

  // ─── Restore Defaults ─────────────────────────────

  const handleRestoreDefaults = useCallback(
    async (role: AdminRole) => {
      if (!tenantId) return;

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

        setRoleOverrides((prev) => {
          const next = { ...prev };
          delete next[role];
          return next;
        });
        toast({ title: t('restoreSuccess', { role: roleLabel(role) }) });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('restoreError');
        logger.error('Failed to restore defaults', err, { role });
        toast({
          title: message,
          variant: 'destructive',
        });
      }

      setSaving(false);
    },
    [tenantId, toast, t, roleLabel],
  );

  // ─── Cleanup Timers ───────────────────────────────

  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      for (const key of Object.keys(timers)) {
        clearTimeout(timers[key]);
      }
    };
  }, []);

  // ─── Loading State ────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  // ─── Access Denied ────────────────────────────────

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
          <ShieldCheck className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-neutral-900">{t('accessDenied')}</h2>
        <p className="text-sm text-neutral-500 mt-2">{t('ownerOnly')}</p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────

  // Track global row index for alternating colors across categories
  let globalRowIndex = 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">{t('title')}</h1>
        <p className="text-neutral-500 text-sm mt-1">{t('subtitle')}</p>
      </div>

      {/* Saving indicator */}
      {saving && (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('saving')}
        </div>
      )}

      {/* Permissions Matrix */}
      <div className="border border-neutral-100 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            {/* Sticky Header Row */}
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-100">
                <th className="text-left text-sm font-semibold text-neutral-900 px-5 py-3.5 min-w-[220px] sticky left-0 bg-neutral-50 z-10">
                  {t('permissionColumn')}
                </th>
                {/* Owner column (locked) */}
                <th className="text-center px-3 py-3.5 min-w-[100px]">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    {roleLabel('owner')}
                  </span>
                </th>
                {/* Editable role columns with individual restore */}
                {EDITABLE_ROLES.map((role) => (
                  <th key={role} className="text-center px-3 py-3.5 min-w-[110px]">
                    <div className="flex flex-col items-center gap-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold',
                          role === 'admin' &&
                            'bg-purple-50 text-purple-700 border border-purple-200',
                          role === 'manager' && 'bg-blue-50 text-blue-700 border border-blue-200',
                          role === 'cashier' &&
                            'bg-green-50 text-green-700 border border-green-200',
                          role === 'chef' &&
                            'bg-orange-50 text-orange-700 border border-orange-200',
                          role === 'waiter' && 'bg-cyan-50 text-cyan-700 border border-cyan-200',
                        )}
                      >
                        {roleLabel(role)}
                      </span>
                      {hasOverrides(role) && (
                        <button
                          type="button"
                          onClick={() => handleRestoreDefaults(role)}
                          className="inline-flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-900 transition-colors"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          {t('reset')}
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body: grouped by category */}
            <tbody>
              {PERMISSION_CATEGORIES.map((category) => {
                const rows = category.permissions.map((perm) => {
                  const rowIdx = globalRowIndex++;
                  return { perm, rowIdx };
                });

                return (
                  <React.Fragment key={category.key}>
                    {/* Category header row */}
                    <tr className="border-b border-neutral-100">
                      <td
                        colSpan={2 + EDITABLE_ROLES.length}
                        className="px-5 py-2.5 bg-white sticky left-0"
                      >
                        <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                          {categoryLabel(category.key)}
                        </span>
                      </td>
                    </tr>

                    {/* Permission rows in this category */}
                    {rows.map(({ perm, rowIdx }) => (
                      <tr
                        key={perm}
                        className={cn(
                          'border-b border-neutral-50 transition-colors hover:bg-neutral-50/80',
                          rowIdx % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50',
                        )}
                      >
                        {/* Permission label (no code column) */}
                        <td className="text-sm text-neutral-900 px-5 py-3 sticky left-0 bg-inherit z-10">
                          <span className="font-medium">{permissionLabel(perm)}</span>
                        </td>

                        {/* Owner cell (always on, locked) */}
                        <td className="text-center px-3 py-3">
                          <div className="flex justify-center opacity-40 pointer-events-none">
                            <Switch
                              checked={true}
                              aria-label={`${permissionLabel(perm)} - ${roleLabel('owner')}`}
                            />
                          </div>
                        </td>

                        {/* Editable role cells */}
                        {EDITABLE_ROLES.map((role) => {
                          const isEnabled = getEffectiveValue(role, perm);
                          const defaultVal = DEFAULT_PERMISSIONS[role]?.[perm] ?? false;
                          const isOverridden = roleOverrides[role]?.[perm] !== undefined;

                          return (
                            <td key={role} className="text-center px-3 py-3">
                              <div className="flex flex-col items-center gap-1">
                                <Switch
                                  checked={isEnabled}
                                  onCheckedChange={() => handleToggle(role, perm)}
                                  className={cn(
                                    isEnabled ? 'data-[state=checked]:bg-lime-400' : '',
                                  )}
                                  aria-label={`${permissionLabel(perm)} - ${roleLabel(role)}`}
                                />
                                {isOverridden && (
                                  <span
                                    className={cn(
                                      'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                                      isEnabled !== defaultVal
                                        ? 'bg-amber-50 text-amber-600'
                                        : 'bg-neutral-50 text-neutral-400',
                                    )}
                                  >
                                    {t('modified')}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="border border-neutral-100 rounded-xl p-6 text-xs text-neutral-500 space-y-1.5">
        <p>
          <span className="inline-block w-3 h-3 rounded-full bg-lime-400 align-middle mr-1.5" />={' '}
          {t('legendAllowed')}
          <span className="inline-block w-3 h-3 rounded-full bg-neutral-200 align-middle ml-4 mr-1.5" />
          = {t('legendDenied')}
        </p>
        <p>
          <span className="inline-block px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium align-middle mr-1.5">
            {t('modified')}
          </span>
          = {t('legendModified')}
        </p>
        <p className="text-neutral-500">{t('autoSaveNote')}</p>
      </div>
    </div>
  );
}
