'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { actionUpdateSupportContact } from '@/app/actions/platform-admin';
import type { CronHeartbeat } from '@/services/platform-settings.service';

interface PlatformSettingsPanelProps {
  heartbeats: CronHeartbeat[];
  supportPhone: string;
}

/** Reglages communs a tous les restaurants et preuve que les taches tournent. */
export function PlatformSettingsPanel({ heartbeats, supportPhone }: PlatformSettingsPanelProps) {
  const t = useTranslations('admin.platform.settings');
  const locale = useLocale();
  const router = useRouter();
  const [phone, setPhone] = useState(supportPhone);
  const [isPending, startTransition] = useTransition();
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' });

  const save = () =>
    startTransition(async () => {
      const res = await actionUpdateSupportContact(phone);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t('saved'));
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-app-text">{t('cronTitle')}</h2>
        <p className="text-sm text-app-text-muted">{t('cronIntro')}</p>
        {heartbeats.length === 0 && (
          <p className="text-sm font-medium text-status-error">{t('cronUnavailable')}</p>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {heartbeats.map((h) => (
            <Card key={h.job} className="p-4">
              <p className="text-sm font-semibold text-app-text">{t(`jobs.${h.job}`)}</p>
              <p
                className={
                  h.needsAttention
                    ? 'mt-2 text-sm font-medium text-status-error'
                    : 'mt-2 text-sm font-medium text-status-success'
                }
              >
                {h.lastRunAt === null
                  ? t('neverSeen')
                  : h.lastStatus === 'error'
                    ? t('lastError')
                    : h.needsAttention
                      ? t('silent')
                      : t('running')}
              </p>
              <p className="mt-1 text-xs text-app-text-muted tabular-nums">
                {h.lastRunAt === null
                  ? t('expected', { schedule: h.schedule })
                  : t('lastRun', {
                      date: dateFmt.format(new Date(h.lastRunAt)),
                      ms: h.lastDurationMs ?? 0,
                    })}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-app-text">{t('supportTitle')}</h2>
        <p className="text-sm text-app-text-muted">{t('supportIntro')}</p>
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="support-phone">{t('supportLabel')}</Label>
            <Input
              id="support-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+226 70 00 00 00"
            />
          </div>
          <Button onClick={save} disabled={isPending || phone.trim() === supportPhone}>
            {isPending ? t('saving') : t('save')}
          </Button>
        </Card>
      </section>
    </div>
  );
}
