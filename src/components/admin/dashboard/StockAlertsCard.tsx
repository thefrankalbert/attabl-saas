'use client';

import { AlertTriangle, Info, OctagonAlert } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export type StockAlertLevel = 'ok' | 'warn' | 'err';

export interface StockAlert {
  id: string;
  level: StockAlertLevel;
  title: string;
  subtitle: string;
}

interface StockAlertsCardProps {
  alerts: StockAlert[];
  title: string;
  watchingLabel: string;
  emptyLabel: string;
  viewAllHref?: string;
  viewAllLabel?: string;
}

const ICO: Record<StockAlertLevel, typeof AlertTriangle> = {
  ok: Info,
  warn: AlertTriangle,
  err: OctagonAlert,
};

const BG: Record<StockAlertLevel, string> = {
  ok: 'bg-accent-muted text-accent',
  warn: 'bg-status-warning-bg text-status-warning',
  err: 'bg-status-error-bg text-status-error',
};

export function StockAlertsCard({
  alerts,
  title,
  watchingLabel,
  emptyLabel,
  viewAllHref,
  viewAllLabel,
}: StockAlertsCardProps) {
  const count = alerts.length;

  return (
    <div className="rounded-[10px] border border-app-border bg-app-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-app-border">
        <div className="flex items-center gap-2 text-[13px] font-medium text-app-text">
          <AlertTriangle className="w-[13px] h-[13px] text-app-text-muted" />
          <span>{title}</span>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] text-app-text-secondary">
          <span className="w-1.5 h-1.5 rounded-full bg-accent admin-pulse" aria-hidden />
          {count > 0 ? `${count} ${watchingLabel}` : emptyLabel}
        </span>
      </div>

      {count === 0 ? (
        <div className="px-5 py-8 text-center text-[12px] text-app-text-muted">{emptyLabel}</div>
      ) : (
        <ul>
          {alerts.map((a) => {
            const Icon = ICO[a.level];
            return (
              <li
                key={a.id}
                className="flex gap-3 items-center px-4 py-3 border-b border-app-border last:border-b-0 text-[12px]"
              >
                <span
                  className={cn(
                    'w-[22px] h-[22px] rounded-full grid place-items-center shrink-0',
                    BG[a.level],
                  )}
                >
                  <Icon className="w-3 h-3" strokeWidth={2.5} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-app-text truncate">{a.title}</p>
                  <p className="font-mono text-[11px] text-app-text-muted mt-0.5 truncate">
                    {a.subtitle}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {viewAllHref && viewAllLabel && count > 0 && (
        <Link
          href={viewAllHref}
          className="block border-t border-app-border px-5 py-2.5 text-[12px] text-accent hover:bg-app-elevated transition-colors"
        >
          {viewAllLabel}
        </Link>
      )}
    </div>
  );
}
