'use client';

import React, { useCallback, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import AdminModal from '@/components/admin/AdminModal';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { actionUpdateAdminUser } from '@/app/actions/admin';
import {
  DEFAULT_PERMISSIONS,
  PERMISSION_CODES,
  type PermissionCode,
  type PermissionMap,
} from '@/types/permission.types';
import type { AdminUser } from '@/types/admin.types';

// Same grouping as the role-level matrix (PermissionsClient) for consistency.
const PERMISSION_CATEGORIES: { key: string; permissions: PermissionCode[] }[] = [
  { key: 'menu', permissions: ['menu.view', 'menu.edit'] },
  { key: 'orders', permissions: ['orders.view', 'orders.manage'] },
  { key: 'reports', permissions: ['reports.view'] },
  { key: 'pos', permissions: ['pos.use'] },
  { key: 'inventory', permissions: ['inventory.view', 'inventory.edit'] },
  { key: 'team', permissions: ['team.view', 'team.manage'] },
  { key: 'settings', permissions: ['settings.view', 'settings.edit'] },
];

interface UserPermissionsDialogProps {
  user: AdminUser;
  tenantId: string;
  /** Tenant-level override for THIS user's role (baseline before per-user diffs). */
  roleOverride: PermissionMap;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Per-user permission override editor. Mount it with a `key={user.id}` so it
 * remounts (and re-reads custom_permissions) per user - no prop-syncing effect.
 */
export default function UserPermissionsDialog({
  user,
  tenantId,
  roleOverride,
  onClose,
  onSaved,
}: UserPermissionsDialogProps) {
  const t = useTranslations('permissions');
  const tc = useTranslations('common');
  const { toast } = useToast();

  // Per-user diffs only (keys constrained to known codes).
  const [overrides, setOverrides] = useState<PermissionMap>(() => {
    const initial: PermissionMap = {};
    const current = user.custom_permissions ?? {};
    for (const code of PERMISSION_CODES) {
      if (typeof current[code] === 'boolean') {
        initial[code] = current[code];
      }
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);

  // Effective value the ROLE grants by default in this tenant (the baseline).
  const baseline = useCallback(
    (perm: PermissionCode): boolean => {
      const override = roleOverride[perm];
      if (override !== undefined) return override;
      return DEFAULT_PERMISSIONS[user.role]?.[perm] ?? false;
    },
    [roleOverride, user.role],
  );

  const effective = useCallback(
    (perm: PermissionCode): boolean => {
      const own = overrides[perm];
      return own !== undefined ? own : baseline(perm);
    },
    [overrides, baseline],
  );

  const handleToggle = useCallback(
    (perm: PermissionCode) => {
      setOverrides((prev) => {
        const next = { ...prev };
        const newValue = !(next[perm] !== undefined ? next[perm] : baseline(perm));
        if (newValue === baseline(perm)) {
          // Back to the role baseline: drop the override.
          delete next[perm];
        } else {
          next[perm] = newValue;
        }
        return next;
      });
    },
    [baseline],
  );

  const resetPerm = useCallback((perm: PermissionCode) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[perm];
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const hasOverrides = Object.keys(overrides).length > 0;
      const res = await actionUpdateAdminUser(tenantId, user.id, {
        custom_permissions: hasOverrides ? overrides : null,
      } as Partial<AdminUser>);
      if (res.error) {
        toast({ title: res.error, variant: 'destructive' });
        return;
      }
      toast({ title: t('userSaveSuccess') });
      onSaved();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [overrides, tenantId, user.id, toast, t, tc, onSaved]);

  const permissionLabel = (perm: PermissionCode): string => t(`perm.${perm.replace('.', '_')}`);
  const categoryLabel = (key: string): string => t(`category.${key}`);

  const isOwner = user.role === 'owner';

  return (
    <AdminModal isOpen onClose={onClose} title={t('userTitle')}>
      <div className="space-y-4 pt-2">
        <p className="text-sm text-app-text-secondary">
          {t('userSubtitle', { name: user.full_name || user.email })}
        </p>

        {isOwner ? (
          <div className="rounded-xl border border-app-border p-6 text-sm text-app-text-secondary">
            {t('ownerAllAccess')}
          </div>
        ) : (
          <div className="border border-app-border rounded-xl divide-y divide-app-border max-h-[55vh] overflow-y-auto">
            {PERMISSION_CATEGORIES.map((category) => (
              <React.Fragment key={category.key}>
                <div className="px-4 py-2 bg-app-card">
                  <span className="text-xs font-medium text-app-text-secondary uppercase tracking-wide">
                    {categoryLabel(category.key)}
                  </span>
                </div>
                {category.permissions.map((perm) => {
                  const isOverridden = overrides[perm] !== undefined;
                  const enabled = effective(perm);
                  return (
                    <div key={perm} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-app-text truncate">
                          {permissionLabel(perm)}
                        </span>
                        {isOverridden && (
                          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-[0.625rem] border border-[var(--border)] text-[var(--warning)]">
                            {t('modified')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isOverridden && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => resetPerm(perm)}
                            aria-label={t('useRoleDefault')}
                            className="inline-flex items-center gap-1 text-[10px] text-app-text-secondary hover:text-app-text h-auto px-1 py-0"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            {t('useRoleDefault')}
                          </Button>
                        )}
                        <Switch
                          checked={enabled}
                          onCheckedChange={() => handleToggle(perm)}
                          className={cn(enabled ? 'data-[state=checked]:bg-[var(--success)]' : '')}
                          aria-label={permissionLabel(perm)}
                        />
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-app-border">
          <Button variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          {!isOwner && (
            <Button variant="default" disabled={saving} onClick={handleSave}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {tc('saveChanges')}
            </Button>
          )}
        </div>
      </div>
    </AdminModal>
  );
}
