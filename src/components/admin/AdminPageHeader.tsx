import type { ReactNode } from 'react';

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional count shown as a muted pill next to the title. A string allows
   * ratio-style counts like "3/12" (e.g. dishes with recipes / total). */
  count?: number | string;
  /** Right-aligned toolbar (search, export, filter toggle, primary action). */
  actions?: ReactNode;
}

/**
 * Canonical page header for admin list/section pages. Centralised so every
 * admin page renders its title at the exact same position, size, and rhythm -
 * navigating between pages no longer shifts the heading around.
 *
 * Contract for the host page: wrap this in a `shrink-0 space-y-4` block at the
 * top of a `flex flex-1 min-h-0 flex-col` root, then put the scrollable content
 * in a sibling `flex-1 min-h-0 overflow-y-auto ... mt-4`.
 */
export default function AdminPageHeader({ title, subtitle, count, actions }: AdminPageHeaderProps) {
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
