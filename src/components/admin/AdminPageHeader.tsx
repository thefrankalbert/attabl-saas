import type { ReactNode } from 'react';

interface AdminPageHeaderProps {
  /** Page name. Rendered visually hidden (sr-only) for screen readers only -
   * the left nav and breadcrumb already identify the page, so we don't repeat
   * it on screen and waste vertical space. */
  title: string;
  /** Toolbar (search, export, filter toggle, primary action). */
  actions?: ReactNode;
}

/**
 * Canonical page header for admin list/section pages. Minimal by design: the
 * title is visually hidden (the nav already says where you are), leaving a
 * single compact row for the page toolbar. The row wraps gracefully so a wide
 * toolbar never overflows or overlaps.
 *
 * Contract for the host page: wrap this in a `shrink-0 space-y-4` block at the
 * top of a `flex flex-1 min-h-0 flex-col` root, then put the scrollable content
 * in a sibling `flex-1 min-h-0 overflow-y-auto ... mt-4`.
 */
export default function AdminPageHeader({ title, actions }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="sr-only">{title}</h1>
      {actions}
    </div>
  );
}
