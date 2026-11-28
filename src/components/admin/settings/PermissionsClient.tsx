'use client';

import React, { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, RotateCcw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import {
  COMING_SOON_PERMISSIONS,
  LIMITED_HINT_KEYS,
  PERMISSION_CATEGORIES,
  PERMISSIONS_WITH_NOTE,
  permissionLabelKey,
  posteLabelKey,
} from '@/lib/permission-catalogue-ui';
import type { PosteOverrides } from '@/lib/permissions';
import {
  POSTE_MATRIX,
  STAFF_POSTES,
  type PermissionCode,
  type Poste,
} from '@/types/permission.types';
import { posteDefault, usePermissionOverrides } from './use-permission-overrides';

// --- Props ---------------------------------------------

interface PermissionsClientProps {
  initialOverrides: PosteOverrides;
}

// --- Component ----------------------------------------

export function PermissionsClient({ initialOverrides }: PermissionsClientProps) {
  const t = useTranslations('permissions');
  const tu = useTranslations('users');
  const {
    saving,
    posteOverrides,
    getEffectiveValue,
    hasOverrides,
    handleToggle,
    handleRestoreDefaults,
  } = usePermissionOverrides(initialOverrides);

  // --- i18n Helpers -----------------------------------

  const permissionLabel = useCallback(
    (perm: PermissionCode): string => {
      return t(`perm.${permissionLabelKey(perm)}`);
    },
    [t],
  );

  const posteLabel = useCallback((poste: Poste): string => tu(posteLabelKey(poste)), [tu]);

  const categoryLabel = useCallback(
    (categoryKey: string): string => {
      return t(`category.${categoryKey}`);
    },
    [t],
  );

  // --- Render ---------------------------------------

  // Track global row index for alternating colors across categories
  let globalRowIndex = 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Header */}
      <div className="shrink-0 space-y-4">
        <AdminPageHeader title={t('title')} />
      </div>

      {/* Body - its own scroll area: the admin content frame clips overflow */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6 space-y-6">
        {/* Saving indicator */}
        {saving && (
          <div className="flex items-center gap-2 text-sm text-app-text-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('saving')}
          </div>
        )}

        {/* Permissions Matrix */}
        <div className="border border-app-border rounded-xl overflow-hidden">
          <Table>
            {/* Sticky Header Row */}
            <TableHeader>
              <TableRow className="bg-app-bg border-b border-app-border">
                <TableHead className="text-left text-sm font-semibold text-app-text px-5 py-3.5 min-w-[180px] md:min-w-[220px] sticky left-0 bg-app-bg z-10">
                  {t('permissionColumn')}
                </TableHead>
                {/* Owner column (locked) */}
                <TableHead className="text-center px-3 py-3.5 min-w-[100px]">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[0.625rem] text-xs font-medium border border-[var(--border)] text-[var(--warning)]">
                    {posteLabel('owner')}
                  </span>
                </TableHead>
                {/* Editable poste columns with individual restore */}
                {STAFF_POSTES.map((poste) => (
                  <TableHead key={poste} className="text-center px-3 py-3.5 min-w-20 md:min-w-28">
                    <div className="flex flex-col items-center gap-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[0.625rem] text-xs font-medium border border-[var(--border)]',
                          'text-[var(--muted-foreground)]',
                        )}
                      >
                        {posteLabel(poste)}
                      </span>
                      {hasOverrides(poste) && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleRestoreDefaults(poste)}
                          className="inline-flex items-center gap-1 text-xs text-app-text-secondary hover:text-app-text h-auto px-1 py-0"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          {t('reset')}
                        </Button>
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            {/* Body: grouped by category */}
            <TableBody>
              {PERMISSION_CATEGORIES.map((category) => {
                const rows = category.permissions.map((perm) => {
                  const rowIdx = globalRowIndex++;
                  return { perm, rowIdx };
                });

                return (
                  <React.Fragment key={category.key}>
                    {/* Category header row */}
                    <TableRow className="border-b border-app-border">
                      <TableCell
                        colSpan={2 + STAFF_POSTES.length}
                        className="px-5 py-2.5 bg-app-card"
                      >
                        {/* The cell spans every column and scrolls with them: only the
                          label is pinned, so the group name stays readable. */}
                        <span className="sticky left-5 text-xs font-medium text-app-text-secondary uppercase tracking-wide">
                          {categoryLabel(category.key)}
                        </span>
                      </TableCell>
                    </TableRow>

                    {/* Permission rows in this category */}
                    {rows.map(({ perm, rowIdx }) => (
                      <TableRow
                        key={perm}
                        className={cn(
                          // Opaque colours only: the pinned label cell inherits them, and a
                          // translucent fill let the switches show through it on scroll.
                          'border-b border-app-border transition-colors hover:bg-app-elevated',
                          rowIdx % 2 === 0 ? 'bg-app-card' : 'bg-app-bg',
                        )}
                      >
                        {/* Permission label (no code column) */}
                        <TableCell className="text-sm text-app-text px-5 py-3 sticky left-0 bg-inherit z-10">
                          <span className="font-medium">{permissionLabel(perm)}</span>
                          {COMING_SOON_PERMISSIONS.includes(perm) && (
                            <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-[0.625rem] border border-[var(--border)] text-app-text-secondary">
                              {t('comingSoon')}
                            </span>
                          )}
                          {PERMISSIONS_WITH_NOTE.includes(perm) && (
                            <p className="mt-1 text-xs font-normal text-app-text-secondary whitespace-normal">
                              {t(`note.${permissionLabelKey(perm)}`)}
                            </p>
                          )}
                        </TableCell>

                        {/* Owner cell (always on, locked) */}
                        <TableCell className="text-center px-3 py-3">
                          <div className="flex justify-center opacity-40 pointer-events-none">
                            <Switch
                              checked={true}
                              aria-label={`${permissionLabel(perm)} - ${posteLabel('owner')}`}
                            />
                          </div>
                        </TableCell>

                        {/* Editable poste cells */}
                        {STAFF_POSTES.map((poste) => {
                          const isEnabled = getEffectiveValue(poste, perm);
                          const defaultVal = posteDefault(poste, perm);
                          const isOverridden = posteOverrides[poste]?.[perm] !== undefined;
                          // Droit borne par defaut ("avec code", "QR marchand",
                          // "factures"): dit en texte tant que rien ne le regle.
                          const hintKey = LIMITED_HINT_KEYS[perm];
                          const limitedByDefault = POSTE_MATRIX[poste][perm] === 'limited';
                          const limitedHint =
                            !isOverridden && hintKey && limitedByDefault
                              ? t(`limited.${hintKey}`)
                              : null;

                          return (
                            <TableCell key={poste} className="text-center px-3 py-3">
                              <div className="flex flex-col items-center gap-1">
                                <Switch
                                  checked={isEnabled}
                                  onCheckedChange={() => handleToggle(poste, perm)}
                                  // Droit pas encore consomme: rien a regler.
                                  disabled={COMING_SOON_PERMISSIONS.includes(perm)}
                                  className={cn(
                                    isEnabled ? 'data-[state=checked]:bg-[var(--success)]' : '',
                                  )}
                                  aria-label={`${permissionLabel(perm)} - ${posteLabel(poste)}`}
                                />
                                {isOverridden && (
                                  <span
                                    className={cn(
                                      'text-[10px] font-medium px-1.5 py-0.5 rounded-[0.625rem] border border-[var(--border)]',
                                      // Un reglage sur une case bornee change
                                      // toujours le droit (entier, ou retire).
                                      isEnabled !== defaultVal || limitedByDefault
                                        ? 'text-[var(--warning)]'
                                        : 'text-app-text-muted',
                                    )}
                                  >
                                    {t('modified')}
                                  </span>
                                )}
                                {limitedHint && (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-[0.625rem] border border-[var(--border)] text-app-text-secondary">
                                    {limitedHint}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Legend */}
        <div className="border border-app-border rounded-xl p-6 text-xs text-app-text-secondary space-y-1.5">
          <p>
            <span className="inline-block w-3 h-3 rounded-full bg-[var(--success)] align-middle mr-1.5" />
            = {t('legendAllowed')}
            <span className="inline-block w-3 h-3 rounded-full bg-border-default align-middle ml-4 mr-1.5" />
            = {t('legendDenied')}
          </p>
          <p>
            <span className="inline-block px-1.5 py-0.5 rounded-[0.625rem] border border-[var(--border)] text-[var(--warning)] font-medium align-middle mr-1.5">
              {t('modified')}
            </span>
            = {t('legendModified')}
          </p>
          <p className="text-app-text-secondary">{t('autoSaveNote')}</p>
        </div>
      </div>
    </div>
  );
}
