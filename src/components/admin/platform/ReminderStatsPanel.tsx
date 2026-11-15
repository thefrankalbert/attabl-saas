'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import type { ReminderRuleStats } from '@/services/reminders/reminder-stats';

/** Mesures des rappels (30 jours), pour decider d'ajuster ou d'arreter une regle. */
export function ReminderStatsPanel({ stats }: { stats: ReminderRuleStats[] }) {
  const t = useTranslations('admin.platform.reminders');
  const nf = new Intl.NumberFormat(useLocale(), { maximumFractionDigits: 1 });
  const pct = (v: number | null) => (v === null ? '-' : `${Math.round(v * 100)} %`);
  const minutes = (v: number | null) => (v === null ? '-' : `${nf.format(v)} min`);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-app-text-muted">{t('intro')}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {stats.map((s) => (
          <Card key={s.rule} className="p-4">
            <p className="text-sm font-semibold text-app-text">{t(`rules.${s.rule}`)}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-app-text-muted">{t('sent')}</dt>
              <dd className="tabular-nums text-right">{s.sent}</dd>
              <dt className="text-app-text-muted">{t('restaurants')}</dt>
              <dd className="tabular-nums text-right">{s.restaurants}</dd>
              {s.kind === 'service' ? (
                <>
                  <dt className="text-app-text-muted">{t('escalated')}</dt>
                  <dd className="tabular-nums text-right">{s.escalated}</dd>
                  <dt className="text-app-text-muted">{t('resolvedWithin')}</dt>
                  <dd className="tabular-nums text-right">{pct(s.resolvedWithinRate)}</dd>
                  <dt className="text-app-text-muted">{t('medianResolve')}</dt>
                  <dd className="tabular-nums text-right">{minutes(s.medianMinutesToResolve)}</dd>
                </>
              ) : (
                <>
                  <dt className="text-app-text-muted">{t('opened')}</dt>
                  <dd className="tabular-nums text-right">{pct(s.openedRate)}</dd>
                </>
              )}
              <dt className="text-app-text-muted">{t('muted')}</dt>
              <dd className="tabular-nums text-right">{s.muted}</dd>
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}
