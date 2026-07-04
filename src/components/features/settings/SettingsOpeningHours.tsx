'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TabsContent } from '@/components/ui/tabs';
import type { UseFormReturn } from 'react-hook-form';
import type { SettingsFormValues } from '@/hooks/useSettingsData';
import type { OpeningHoursDay, OpeningHoursMap } from '@/types/admin.types';

// --- Types -------------------------------------------------

interface SettingsOpeningHoursProps {
  form: UseFormReturn<SettingsFormValues>;
  t: (key: string) => string;
}

const DAYS: { key: OpeningHoursDay; labelKey: string }[] = [
  { key: 'mon', labelKey: 'dayMon' },
  { key: 'tue', labelKey: 'dayTue' },
  { key: 'wed', labelKey: 'dayWed' },
  { key: 'thu', labelKey: 'dayThu' },
  { key: 'fri', labelKey: 'dayFri' },
  { key: 'sat', labelKey: 'daySat' },
  { key: 'sun', labelKey: 'daySun' },
];

const DEFAULT_OPEN = '09:00';
const DEFAULT_CLOSE = '22:00';

// --- Component ---------------------------------------------

export default function SettingsOpeningHours({ form, t }: SettingsOpeningHoursProps) {
  const hours: OpeningHoursMap = form.watch('openingHours') ?? {};

  const update = (next: OpeningHoursMap) =>
    form.setValue('openingHours', next, { shouldDirty: true, shouldValidate: true });

  const toggleDay = (day: OpeningHoursDay, open: boolean) => {
    const next: OpeningHoursMap = { ...hours };
    if (open) {
      next[day] = { open: DEFAULT_OPEN, close: DEFAULT_CLOSE };
    } else {
      delete next[day];
    }
    update(next);
  };

  const setTime = (day: OpeningHoursDay, field: 'open' | 'close', value: string) => {
    const slot = hours[day];
    if (!slot) return;
    update({ ...hours, [day]: { ...slot, [field]: value } });
  };

  return (
    <TabsContent value="hours" className="mt-0">
      <p className="mb-4 text-sm text-app-text-secondary">{t('openingHoursHint')}</p>
      <div className="space-y-3">
        {DAYS.map(({ key, labelKey }) => {
          const slot = hours[key];
          const isOpen = !!slot;
          return (
            <div
              key={key}
              className="flex flex-wrap items-center gap-3 border-b border-app-border pb-3 sm:gap-4"
            >
              <div className="flex min-w-[150px] items-center gap-3">
                <Switch
                  id={`day-${key}`}
                  checked={isOpen}
                  onCheckedChange={(checked) => toggleDay(key, checked)}
                  aria-label={t(labelKey)}
                />
                <Label htmlFor={`day-${key}`} className="cursor-pointer">
                  {t(labelKey)}
                </Label>
              </div>
              {isOpen && slot ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={slot.open}
                    onChange={(e) => setTime(key, 'open', e.target.value)}
                    aria-label={`${t(labelKey)} - ${t('openingHoursOpen')}`}
                    className="w-[120px] min-h-[44px]"
                  />
                  <span className="text-app-text-secondary">-</span>
                  <Input
                    type="time"
                    value={slot.close}
                    onChange={(e) => setTime(key, 'close', e.target.value)}
                    aria-label={`${t(labelKey)} - ${t('openingHoursClose')}`}
                    className="w-[120px] min-h-[44px]"
                  />
                </div>
              ) : (
                <span className="text-sm text-app-text-secondary">{t('openingHoursClosed')}</span>
              )}
            </div>
          );
        })}
      </div>
    </TabsContent>
  );
}
