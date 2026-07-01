import type { ReactNode } from 'react';

interface AnalyseSectionHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional count shown as a muted pill next to the title. */
  count?: number;
  /** Right-aligned toolbar (search, export, filter toggle). */
  actions?: ReactNode;
}

/**
 * Shared title row for the four Analyse tabs (Rapports, Historique stock,
 * Factures, Journal d'audit). Centralised so every tab renders the header at
 * the exact same position, size, and rhythm - the tab bar above it lives in the
 * (analyse) layout and never remounts, so switching tabs no longer shifts the
 * heading around.
 */
export default function AnalyseSectionHeader({
  title,
  subtitle,
  count,
  actions,
}: AnalyseSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 @lg:flex-row @lg:items-start">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold tracking-tight text-app-text">{title}</h1>
          {count !== undefined && (
            <span className="rounded-md bg-app-elevated px-2 py-0.5 text-xs font-medium tabular-nums text-app-text-muted">
              {count}
            </span>
          )}
        </div>
        {subtitle && <p className="text-sm text-app-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 @lg:ml-auto">{actions}</div>}
    </div>
  );
}
