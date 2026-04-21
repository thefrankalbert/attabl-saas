import { useTranslations, useLocale } from 'next-intl';

interface MicroRowProps {
  ordersToday: number;
  sitesOnline: number;
  sitesTotal: number;
  alertsCount: number;
}

/**
 * Three sober indicators under the hero: Commandes / Sites / Alertes.
 * Matches Dashboard ATTABL.html :: .micro.
 *
 * No interactive state — imports useTranslations from a client ancestor
 * but doesn't declare 'use client' itself so Next can include it in the
 * parent's client bundle without marking it a boundary of its own.
 */
export function MicroRow({ ordersToday, sitesOnline, sitesTotal, alertsCount }: MicroRowProps) {
  const t = useTranslations('admin.tenants.commandCenter.micro');
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return (
    <div className="-mt-2 flex items-end gap-8">
      <MicroCell label={t('orders')}>
        <span
          className="cc-mono block whitespace-nowrap text-[22px] font-normal tracking-tight"
          style={{ color: 'var(--cc-text)' }}
        >
          {nf.format(ordersToday)}
        </span>
      </MicroCell>

      <MicroCell label={t('sites')}>
        <span
          className="cc-mono mt-2 inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]"
          style={{ color: 'var(--cc-accent-ink)' }}
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ background: 'var(--cc-accent-ink)' }}
          />
          {t('sitesOnline', { online: sitesOnline, total: sitesTotal })}
        </span>
      </MicroCell>

      <MicroCell label={t('alerts')}>
        {alertsCount > 0 ? (
          <span
            className="cc-mono block whitespace-nowrap text-[22px] font-normal tracking-tight"
            style={{ color: 'var(--cc-warn)' }}
          >
            {nf.format(alertsCount)}
          </span>
        ) : (
          <span
            className="cc-mono block whitespace-nowrap text-[22px] font-normal tracking-tight"
            style={{ color: 'var(--cc-text-3)' }}
          >
            -
          </span>
        )}
      </MicroCell>
    </div>
  );
}

function MicroCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <div
        className="text-[11px] font-medium uppercase tracking-[0.06em]"
        style={{ color: 'var(--cc-text-3)' }}
      >
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
