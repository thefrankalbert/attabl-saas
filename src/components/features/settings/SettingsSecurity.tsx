'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TabsContent } from '@/components/ui/tabs';
import type { UseFormReturn } from 'react-hook-form';
import type { SettingsFormValues } from '@/hooks/useSettingsData';
import SettingsDataReset from './SettingsDataReset';

// ─── Types ─────────────────────────────────────────────────

interface SettingsSecurityProps {
  form: UseFormReturn<SettingsFormValues>;
  t: (key: string) => string;
  tenantSlug: string;
}

// ─── Component ─────────────────────────────────────────────

export default function SettingsSecurity({ form, t, tenantSlug }: SettingsSecurityProps) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const watchIdleTimeoutMinutes = watch('idleTimeoutMinutes');
  const watchScreenLockMode = watch('screenLockMode');

  return (
    <TabsContent value="security" className="mt-0">
      <div className="space-y-4">
        {/* Enable/disable toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-app-border">
          <div>
            <Label className="text-sm font-medium text-app-text">{t('enableAutoLock')}</Label>
            <p className="text-xs text-app-text-secondary mt-0.5">{t('screenLockedAfterIdle')}</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={watchIdleTimeoutMinutes !== null && watchIdleTimeoutMinutes !== undefined}
              onChange={(e) => {
                setValue('idleTimeoutMinutes', e.target.checked ? 30 : null);
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-app-elevated peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-accent-text after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-accent-text after:border-app-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </label>
        </div>

        {/* Timeout duration + lock mode (shown only when enabled) */}
        {watchIdleTimeoutMinutes !== null && watchIdleTimeoutMinutes !== undefined && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
            {/* Duration */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <Label
                htmlFor="idleTimeoutMinutes"
                className="text-sm text-app-text-secondary whitespace-nowrap"
              >
                {t('idleTimeout')}
              </Label>
              <div className="relative w-28">
                <Input
                  id="idleTimeoutMinutes"
                  type="number"
                  min={5}
                  max={120}
                  step={5}
                  {...register('idleTimeoutMinutes', { valueAsNumber: true })}
                  className="pr-12 min-h-[44px]"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-app-text-muted">
                  min
                </span>
              </div>
              <span className="text-xs text-app-text-muted">{t('idleRange')}</span>
            </div>
            {errors.idleTimeoutMinutes && (
              <p className="text-xs text-status-error">{errors.idleTimeoutMinutes.message}</p>
            )}

            {/* Lock mode */}
            <div className="space-y-2">
              <Label className="text-sm text-app-text-secondary">{t('screenLockMode')}</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setValue('screenLockMode', 'overlay')}
                  className={`p-3 min-h-[44px] rounded-lg border-2 text-left transition-all ${
                    watchScreenLockMode === 'overlay'
                      ? 'border-accent bg-accent-muted ring-1 ring-accent/20'
                      : 'border-app-border hover:border-app-text-muted'
                  }`}
                >
                  <div className="font-medium text-sm text-app-text">{t('overlaySimple')}</div>
                  <div className="text-xs text-app-text-secondary mt-0.5">{t('clickToUnlock')}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setValue('screenLockMode', 'password')}
                  className={`p-3 min-h-[44px] rounded-lg border-2 text-left transition-all ${
                    watchScreenLockMode === 'password'
                      ? 'border-accent bg-accent-muted ring-1 ring-accent/20'
                      : 'border-app-border hover:border-app-text-muted'
                  }`}
                >
                  <div className="font-medium text-sm text-app-text">{t('passwordRequired')}</div>
                  <div className="text-xs text-app-text-secondary mt-0.5">
                    {t('reenterPassword')}
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Data Reset -- Danger Zone (owner/admin only) */}
        <SettingsDataReset tenantSlug={tenantSlug} />
      </div>
    </TabsContent>
  );
}
