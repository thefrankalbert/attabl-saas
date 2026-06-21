import { useTranslations, useLocale } from 'next-intl';

import { Button } from '@/components/ui/button';

interface MicroRowProps {
  ordersToday: number;
  sitesOnline: number;
  sitesTotal: number;
  alertsCount: number;
  /** Scrolls to the alerts panel; only wired when alertsCount > 0. */
  onAlertsClick?: () => void;
}

/**
 * Three sober indicators under the hero: Commandes / Sites / Alertes.
 * Each is a small bordered stat-card with an uppercase micro-label and a
 * mono figure. The Alertes card becomes an interactive Button when there
 * are alerts so the page-client can scroll to the alerts panel.
 *
 * No interactive state of its own - imports useTranslations from a client
 * ancestor but doesn't declare 'use client' itself so Next can include it in
 * the parent's client bundle without marking it a boundary of its own.
 */
export function MicroRow({
  ordersToday,
  sitesOnline,
  sitesTotal,
  alertsCount,
  onAlertsClick,
}: MicroRowProps) {
  const t = useTranslations('admin.tenants.commandCenter.micro');
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const hasAlerts = alertsCount > 0;

  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCard label={t('orders')}>
        <span
          className="cc-mono block whitespace-nowrap text-[18px] font-semibold tracking-tight sm:text-[20px]"
          style={{ color: 'var(--cc-text)' }}
        >
          {nf.format(ordersToday)}
        </span>
      </StatCard>

      <StatCard label={t('sites')}>
        <span
          className="cc-mono flex items-center gap-1.5 text-[12px] leading-snug sm:text-[13px]"
          style={{ color: 'var(--cc-accent-ink)' }}
        >
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: 'var(--cc-accent-ink)' }}
          />
          <span className="min-w-0">
            {t('sitesOnline', { online: sitesOnline, total: sitesTotal })}
          </span>
        </span>
      </StatCard>

      {hasAlerts ? (
        <Button
          variant="ghost"
          onClick={onAlertsClick}
          className="h-auto min-h-[44px] flex-col items-start gap-1 rounded-[12px] border border-[var(--cc-border)] bg-[var(--cc-surface)] p-3 text-left hover:border-[var(--cc-border-strong)]"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--cc-text-3)]">
            {t('alerts')}
          </span>
          <span
            className="cc-mono block whitespace-nowrap text-[18px] font-semibold tracking-tight sm:text-[20px]"
            style={{ color: 'var(--cc-warn)' }}
          >
            {nf.format(alertsCount)}
          </span>
        </Button>
      ) : (
        <StatCard label={t('alerts')}>
          <span
            className="cc-mono block whitespace-nowrap text-[18px] font-semibold tracking-tight sm:text-[20px]"
            style={{ color: 'var(--cc-text-3)' }}
          >
            -
          </span>
        </StatCard>
      )}
    </div>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[12px] border border-[var(--cc-border)] bg-[var(--cc-surface)] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--cc-text-3)]">
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
