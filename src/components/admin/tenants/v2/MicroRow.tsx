'use client';

interface MicroRowProps {
  ordersToday: number;
  sitesOnline: number;
  sitesTotal: number;
  alertsCount: number;
}

/**
 * Three sober indicators under the hero: Commandes / Sites / Alertes.
 * Matches Dashboard ATTABL.html :: .micro.
 */
export function MicroRow({ ordersToday, sitesOnline, sitesTotal, alertsCount }: MicroRowProps) {
  return (
    <div className="-mt-2 flex items-end gap-8">
      <MicroCell label="Commandes">
        <span
          className="cc-mono block whitespace-nowrap text-[22px] font-normal tracking-tight"
          style={{ color: 'var(--cc-text)' }}
        >
          {ordersToday.toLocaleString('fr-FR')}
        </span>
      </MicroCell>

      <MicroCell label="Sites">
        <span
          className="cc-mono mt-2 inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]"
          style={{ color: 'var(--cc-accent-ink)' }}
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ background: 'var(--cc-accent-ink)' }}
          />
          {sitesOnline} / {sitesTotal} en ligne
        </span>
      </MicroCell>

      <MicroCell label="Alertes">
        {alertsCount > 0 ? (
          <span
            className="cc-mono block whitespace-nowrap text-[22px] font-normal tracking-tight"
            style={{ color: 'var(--cc-warn)' }}
          >
            {alertsCount.toLocaleString('fr-FR')}
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
