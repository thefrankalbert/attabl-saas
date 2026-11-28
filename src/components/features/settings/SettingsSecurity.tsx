'use client';

import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TabsContent } from '@/components/ui/tabs';
import type { UseFormReturn } from 'react-hook-form';
import type { SettingsFormValues } from '@/hooks/useSettingsData';
import RoleGuard from '@/components/admin/RoleGuard';
import SettingsDataReset from './SettingsDataReset';
import DeleteAccountSection from './DeleteAccountSection';
import SecurityAccountSection from './SecurityAccountSection';
import { SecurityRow, SecuritySection } from './SecuritySection';

// --- Types -------------------------------------------------

interface SettingsSecurityProps {
  form: UseFormReturn<SettingsFormValues>;
  t: (key: string) => string;
  tenantSlug: string;
  tenantName: string;
}

/** Delays offered for the automatic lock, in minutes (the schema allows 5 to 120). */
const LOCK_DELAYS = [5, 10, 15, 30, 60, 120];
const DEFAULT_LOCK_DELAY = 30;

// --- Component ---------------------------------------------

export default function SettingsSecurity({
  form,
  t,
  tenantSlug,
  tenantName,
}: SettingsSecurityProps) {
  const tSettings = useTranslations('settings');
  const { watch, setValue } = form;

  const idleMinutes = watch('idleTimeoutMinutes');
  const lockMode = watch('screenLockMode') ?? 'overlay';
  const lockEnabled = idleMinutes !== null && idleMinutes !== undefined;

  // A delay saved before the list existed (e.g. 25) stays selectable.
  const delays =
    lockEnabled && !LOCK_DELAYS.includes(idleMinutes)
      ? [...LOCK_DELAYS, idleMinutes].sort((a, b) => a - b)
      : LOCK_DELAYS;

  return (
    <TabsContent value="security" className="mt-0">
      <div className="space-y-8">
        <SecuritySection title={t('securityLockTitle')} description={t('securityLockDesc')}>
          <SecurityRow title={t('enableAutoLock')} description={t('screenLockedAfterIdle')}>
            <Switch
              aria-label={t('enableAutoLock')}
              checked={lockEnabled}
              onCheckedChange={(on) =>
                setValue('idleTimeoutMinutes', on ? DEFAULT_LOCK_DELAY : null)
              }
            />
          </SecurityRow>

          {lockEnabled && (
            <>
              <SecurityRow title={t('lockAfterLabel')}>
                <Select
                  value={String(idleMinutes)}
                  onValueChange={(v) => setValue('idleTimeoutMinutes', Number(v))}
                >
                  <SelectTrigger
                    aria-label={t('lockAfterLabel')}
                    className="min-h-[44px] w-full sm:w-40"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {delays.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {tSettings('lockMinutes', { count: m })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SecurityRow>

              <div className="space-y-3 p-4">
                <p className="text-sm font-medium text-app-text">{t('unlockLabel')}</p>
                <RadioGroup
                  value={lockMode}
                  onValueChange={(v) => setValue('screenLockMode', v as 'overlay' | 'password')}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {(
                    [
                      ['password', 'unlockPassword', 'unlockPasswordDesc'],
                      ['overlay', 'unlockTouch', 'unlockTouchDesc'],
                    ] as const
                  ).map(([value, title, desc]) => (
                    <Label
                      key={value}
                      htmlFor={`unlock-${value}`}
                      className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border border-app-border p-3 has-[[data-state=checked]]:border-app-text"
                    >
                      <RadioGroupItem id={`unlock-${value}`} value={value} className="mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-app-text">{t(title)}</span>
                        <span className="mt-0.5 block text-xs font-normal text-app-text-secondary">
                          {t(desc)}
                        </span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            </>
          )}
        </SecuritySection>

        <SecurityAccountSection />

        {/* Owner only: reset data, close the restaurant */}
        <RoleGuard ownerOnly fallback={null}>
          <SecuritySection title={t('dangerZone')} description={t('dangerZoneDescription')}>
            <SettingsDataReset tenantSlug={tenantSlug} />
          </SecuritySection>
          <DeleteAccountSection variant="owner" restaurantName={tenantName} />
        </RoleGuard>
      </div>
    </TabsContent>
  );
}
