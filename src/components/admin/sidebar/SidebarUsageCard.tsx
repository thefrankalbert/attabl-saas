import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SidebarUsageCardProps {
  label: string;
  /** 0..100, clamped internally */
  percent: number;
  subtitle?: string;
  /** Optional slot rendered inside the same card, below the usage bar (e.g. account trigger). */
  footerSlot?: ReactNode;
}

/**
 * Footer card for the redesigned admin sidebar.
 * Shows monthly orders usage (progress bar) + the plan/email meta line,
 * optionally with a footer slot (e.g. the account popover trigger)
 * rendered inside the same card to unify both elements visually.
 */
export function SidebarUsageCard({ label, percent, subtitle, footerSlot }: SidebarUsageCardProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className="rounded-lg border border-app-border bg-app-elevated overflow-hidden">
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between text-[11px] text-app-text-secondary">
          <span>{label}</span>
          <span className="font-mono">{clamped}%</span>
        </div>
        <div className="mt-2 h-[3px] w-full rounded-full bg-app-border overflow-hidden">
          <div
            className={cn('h-full rounded-full bg-accent transition-[width] duration-300')}
            style={{ width: `${clamped}%` }}
          />
        </div>
        {subtitle && (
          <p className="mt-2 font-mono text-[11px] text-app-text-muted truncate">{subtitle}</p>
        )}
      </div>
      {footerSlot && <div className="border-t border-app-border">{footerSlot}</div>}
    </div>
  );
}
