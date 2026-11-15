'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { actionUpdateReminderSettings } from '@/app/actions/reminders';
import {
  REMINDER_RULES,
  type ReminderRule,
  type ReminderSettings,
} from '@/lib/validations/reminders.schema';

interface ReminderSettingsPanelProps {
  initial: ReminderSettings;
  hasOpeningHours: boolean;
  canEdit: boolean;
}

const READY_CHOICES = [2, 3, 5, 8, 10, 15];
const NOT_STARTED_CHOICES = [3, 5, 8, 10, 15, 20, 30];

export function ReminderSettingsPanel({
  initial,
  hasOpeningHours,
  canEdit,
}: ReminderSettingsPanelProps) {
  const t = useTranslations('settings.reminders');
  const tc = useTranslations('common');
  const { toast } = useToast();
  const [settings, setSettings] = useState<ReminderSettings>(initial);
  const [saved, setSaved] = useState<ReminderSettings>(initial);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  const setRule = (rule: ReminderRule, on: boolean) =>
    setSettings((s) => ({ ...s, rules: { ...s.rules, [rule]: on } }));

  const save = () =>
    startTransition(async () => {
      const res = await actionUpdateReminderSettings(settings);
      if (res.success) {
        setSaved(settings);
        toast({ title: t('saved') });
      } else {
        toast({ title: t('saveError'), description: res.error, variant: 'destructive' });
      }
    });

  const minutesSelect = (
    id: string,
    value: number,
    choices: number[],
    onChange: (v: number) => void,
  ) => (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-sm text-app-text-secondary">
        {t('after')}
      </Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))} disabled={!canEdit}>
        <SelectTrigger id={id} className="w-28 min-h-[44px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((m) => (
            <SelectItem key={m} value={String(m)}>
              {t('minutes', { count: m })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <TabsContent value="reminders" className="mt-0 space-y-4">
      <p className="text-sm text-app-text-secondary">{t('intro')}</p>

      {REMINDER_RULES.map((rule) => (
        <Card key={rule} className="p-4 sm:p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <Label htmlFor={`rule-${rule}`} className="text-sm font-semibold text-app-text">
                {t(`rules.${rule}.title`)}
              </Label>
              <p className="text-sm text-app-text-secondary">{t(`rules.${rule}.desc`)}</p>
              <p className="text-xs text-app-text-muted">{t(`rules.${rule}.who`)}</p>
            </div>
            <Switch
              id={`rule-${rule}`}
              checked={settings.rules[rule]}
              onCheckedChange={(on) => setRule(rule, on)}
              disabled={!canEdit}
            />
          </div>
          {rule === 'order_ready_not_served' &&
            settings.rules[rule] &&
            minutesSelect('ready-min', settings.ready_not_served_min, READY_CHOICES, (v) =>
              setSettings((s) => ({ ...s, ready_not_served_min: v })),
            )}
          {rule === 'order_not_started' &&
            settings.rules[rule] &&
            minutesSelect('started-min', settings.not_started_min, NOT_STARTED_CHOICES, (v) =>
              setSettings((s) => ({ ...s, not_started_min: v })),
            )}
          {rule === 'pre_service_stock' && settings.rules[rule] && !hasOpeningHours && (
            <p className="text-xs text-status-warning">{t('needsHours')}</p>
          )}
        </Card>
      ))}

      {canEdit && (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="min-h-[44px] min-w-[150px]"
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {pending ? tc('saving') : tc('saveChanges')}
          </Button>
        </div>
      )}
    </TabsContent>
  );
}
