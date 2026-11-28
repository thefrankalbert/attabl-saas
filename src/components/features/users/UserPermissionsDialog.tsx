'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import AdminModal from '@/components/admin/AdminModal';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { actionUpdateAdminUser } from '@/app/actions/admin';
import {
  COMING_SOON_PERMISSIONS,
  LIMITED_HINT_KEYS,
  PERMISSION_CATEGORIES,
  PERMISSIONS_WITH_NOTE,
  nextOverride,
  permissionLabelKey,
} from '@/lib/permission-catalogue-ui';
import { permissionLevel, type PosteOverrides } from '@/lib/permissions';
import {
  PERMISSION_CODES,
  type PermissionCode,
  type PermissionLevel,
  type PermissionMap,
} from '@/types/permission.types';
import type { AdminUser } from '@/types/admin.types';

interface UserPermissionsDialogProps {
  user: AdminUser;
  tenantId: string;
  /** Reglages du restaurant par poste: la base avant le reglage par personne. */
  posteOverrides: PosteOverrides;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Per-user permission override editor. Mount it with a `key={user.id}` so it
 * remounts (and re-reads permission_overrides) per user - no prop-syncing effect.
 */
export default function UserPermissionsDialog({
  user,
  tenantId,
  posteOverrides,
  onClose,
  onSaved,
}: UserPermissionsDialogProps) {
  const t = useTranslations('permissions');
  const tc = useTranslations('common');
  const { toast } = useToast();

  // Per-user diffs only (keys constrained to known codes).
  const [overrides, setOverrides] = useState<PermissionMap>(() => {
    const initial: PermissionMap = {};
    const current = user.permission_overrides ?? {};
    for (const code of PERMISSION_CODES) {
      if (typeof current[code] === 'boolean') {
        initial[code] = current[code];
      }
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedOnceRef = useRef(false);
  const overridesRef = useRef<PermissionMap>(overrides);
  const pendingRef = useRef<PermissionMap | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist the whole permission_overrides map (replaced wholesale; null =
  // follow the postes). Toast on success AND on error, plus the inline status: the
  // inline "Enregistre" alone went unnoticed (verification test 2026-11-24).
  const persist = useCallback(
    async (next: PermissionMap): Promise<boolean> => {
      setSaving(true);
      try {
        const res = await actionUpdateAdminUser(tenantId, user.id, {
          permission_overrides: Object.keys(next).length > 0 ? next : null,
        });
        if (res.error) {
          toast({ title: res.error, variant: 'destructive' });
          return false;
        }
        savedOnceRef.current = true;
        setSaved(true);
        toast({ title: t('saved') });
        return true;
      } catch {
        toast({ title: tc('error'), variant: 'destructive' });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [tenantId, user.id, toast, tc, t],
  );

  // Auto-save: debounce rapid toggles into a single write (matches the per-role
  // matrix in PermissionsClient - no easy-to-miss Save button).
  const scheduleSave = useCallback(
    (next: PermissionMap) => {
      pendingRef.current = next;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const toSave = pendingRef.current;
        pendingRef.current = null;
        timerRef.current = null;
        if (toSave) void persist(toSave);
      }, 500);
    },
    [persist],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Ce que les POSTES du membre donnent dans ce restaurant, sans son reglage
  // par personne (cumul: le niveau le plus haut entre ses postes).
  const baselineLevel = useCallback(
    (perm: PermissionCode): PermissionLevel | null =>
      permissionLevel({ postes: user.postes ?? [] }, perm, posteOverrides),
    [posteOverrides, user.postes],
  );
  // Le reglage par personne est booleen: seul le droit entier compte comme "oui".
  const baseline = useCallback(
    (perm: PermissionCode): boolean => baselineLevel(perm) === 'full',
    [baselineLevel],
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
      const next = { ...overridesRef.current };
      // Retour au niveau des postes: le reglage est retire. Un droit borne par
      // les postes ne se retire pas en "revenant au defaut": on ecrit `false`.
      const value = nextOverride(baselineLevel(perm), next[perm]);
      if (value === undefined) delete next[perm];
      else next[perm] = value;
      overridesRef.current = next;
      setOverrides(next);
      scheduleSave(next);
    },
    [baselineLevel, scheduleSave],
  );

  const resetPerm = useCallback(
    (perm: PermissionCode) => {
      const next = { ...overridesRef.current };
      delete next[perm];
      overridesRef.current = next;
      setOverrides(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  // Flush a pending debounced save, then close. onSaved reloads the parent list,
  // so only fire it when something was actually persisted this session.
  const handleClose = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current) {
      const toSave = pendingRef.current;
      pendingRef.current = null;
      const ok = await persist(toSave);
      // Flush failed: keep the dialog open so the error toast stays visible and
      // the user can retry (do not reload the parent and wipe the toast).
      if (!ok) return;
    }
    if (savedOnceRef.current) onSaved();
    else onClose();
  }, [persist, onSaved, onClose]);

  const permissionLabel = (perm: PermissionCode): string => t(`perm.${permissionLabelKey(perm)}`);
  const categoryLabel = (key: string): string => t(`category.${key}`);

  const isOwner = (user.postes ?? []).includes('owner');

  return (
    <AdminModal isOpen onClose={isOwner ? onClose : handleClose} title={t('userTitle')}>
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
                  // Droit borne par defaut ("avec code", "QR marchand",
                  // "factures"): dit en texte, tant qu'aucun reglage ne tranche.
                  const hintKey = LIMITED_HINT_KEYS[perm];
                  const limitedHint =
                    !isOverridden && hintKey && baselineLevel(perm) === 'limited'
                      ? t(`limited.${hintKey}`)
                      : null;
                  return (
                    <div key={perm} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                        <span className="text-sm text-app-text truncate">
                          {permissionLabel(perm)}
                        </span>
                        {COMING_SOON_PERMISSIONS.includes(perm) && (
                          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-[0.625rem] border border-[var(--border)] text-app-text-secondary">
                            {t('comingSoon')}
                          </span>
                        )}
                        {isOverridden && (
                          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-[0.625rem] border border-[var(--border)] text-[var(--warning)]">
                            {t('modified')}
                          </span>
                        )}
                        {limitedHint && (
                          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-[0.625rem] border border-[var(--border)] text-app-text-secondary">
                            {limitedHint}
                          </span>
                        )}
                        {PERMISSIONS_WITH_NOTE.includes(perm) && (
                          <p className="basis-full text-xs text-app-text-secondary">
                            {t(`note.${permissionLabelKey(perm)}`)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isOverridden && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => resetPerm(perm)}
                            aria-label={t('useRoleDefault')}
                            className="inline-flex items-center gap-1 text-xs text-app-text-secondary hover:text-app-text h-auto px-1 py-0"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            {t('useRoleDefault')}
                          </Button>
                        )}
                        <Switch
                          checked={enabled}
                          onCheckedChange={() => handleToggle(perm)}
                          // Droit pas encore consomme: rien a regler.
                          disabled={COMING_SOON_PERMISSIONS.includes(perm)}
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

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-app-border">
          {isOwner ? (
            <span />
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-app-text-secondary">
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {tc('saving')}
                </>
              ) : saved ? (
                <>
                  <Check className="w-3.5 h-3.5 text-status-success" />
                  {t('saved')}
                </>
              ) : (
                t('autoSaveHint')
              )}
            </span>
          )}
          <Button variant="default" onClick={isOwner ? onClose : handleClose}>
            {tc('close')}
          </Button>
        </div>
      </div>
    </AdminModal>
  );
}
