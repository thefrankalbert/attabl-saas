'use client';

import { Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TabsContent } from '@/components/ui/tabs';
import type { UseFormReturn } from 'react-hook-form';
import type { SettingsFormValues } from '@/hooks/useSettingsData';

// ─── Types ─────────────────────────────────────────────────

interface SettingsSecurityProps {
  form: UseFormReturn<SettingsFormValues>;
  t: (key: string) => string;
}

// ─── Component ─────────────────────────────────────────────

export default function SettingsSecurity({ form, t }: SettingsSecurityProps) {
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
      <div className="bg-white rounded-xl border border-neutral-100 p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-indigo-50 rounded-lg">
            <Shield className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{t('idleLock')}</h2>
            <p className="text-sm text-neutral-500">{t('autoLockDashboard')}</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Enable/disable toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-neutral-100 bg-neutral-50/50">
            <div>
              <Label className="text-sm font-medium text-neutral-900">{t('enableAutoLock')}</Label>
              <p className="text-xs text-neutral-500 mt-0.5">{t('screenLockedAfterIdle')}</p>
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
              <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
            </label>
          </div>

          {/* Timeout duration + lock mode (shown only when enabled) */}
          {watchIdleTimeoutMinutes !== null && watchIdleTimeoutMinutes !== undefined && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
              {/* Duration */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <Label
                  htmlFor="idleTimeoutMinutes"
                  className="text-sm text-neutral-600 whitespace-nowrap"
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
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
                    min
                  </span>
                </div>
                <span className="text-xs text-neutral-400">{t('idleRange')}</span>
              </div>
              {errors.idleTimeoutMinutes && (
                <p className="text-xs text-red-500">{errors.idleTimeoutMinutes.message}</p>
              )}

              {/* Lock mode */}
              <div className="space-y-2">
                <Label className="text-sm text-neutral-600">{t('screenLockMode')}</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setValue('screenLockMode', 'overlay')}
                    className={`p-3 min-h-[44px] rounded-lg border-2 text-left transition-all ${
                      watchScreenLockMode === 'overlay'
                        ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500/20'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <div className="font-medium text-sm text-neutral-900">{t('overlaySimple')}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">{t('clickToUnlock')}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setValue('screenLockMode', 'password')}
                    className={`p-3 min-h-[44px] rounded-lg border-2 text-left transition-all ${
                      watchScreenLockMode === 'password'
                        ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500/20'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <div className="font-medium text-sm text-neutral-900">
                      {t('passwordRequired')}
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">{t('reenterPassword')}</div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </TabsContent>
  );
}
