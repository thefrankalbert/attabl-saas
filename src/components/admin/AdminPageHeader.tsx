import type { ReactNode } from 'react';

interface AdminPageHeaderProps {
  /** Page name. Rendered visually hidden (sr-only) for screen readers only -
   * the left nav and breadcrumb already identify the page, so we don't repeat
   * it on screen and waste vertical space. */
  title: string;
  /** Optional count shown as a muted pill. A string allows ratio-style counts
   * like "3/12" (e.g. dishes with recipes / total). */
  count?: number | string;
  /** Toolbar (search, export, filter toggle, primary action). */
  actions?: ReactNode;
}

/**
 * Canonical page header for admin list/section pages. Minimal by design: the
 * title is visually hidden (the nav already says where you are), leaving a
 * single compact row of the optional count pill plus the page toolbar. The row
 * wraps gracefully so a wide toolbar never overflows or overlaps.
 *
 * Contract for the host page: wrap this in a `shrink-0 space-y-4` block at the
 * top of a `flex flex-1 min-h-0 flex-col` root, then put the scrollable content
 * in a sibling `flex-1 min-h-0 overflow-y-auto ... mt-4`.
 */
export default function AdminPageHeader({ title, count, actions }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="sr-only">{title}</h1>
      {count !== undefined && (
        <span className="shrink-0 rounded-md bg-app-elevated px-2 py-0.5 text-xs font-medium tabular-nums text-app-text-muted">
          {count}
        </span>
      )}
      {actions}
    </div>
  );
}
