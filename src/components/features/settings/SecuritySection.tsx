import type { ReactNode } from 'react';

/** A titled block of the security page: heading, one line of context, then rows. */
export function SecuritySection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-app-text">{title}</h3>
        <p className="mt-0.5 text-xs text-app-text-secondary">{description}</p>
      </div>
      <div className="divide-y divide-app-border rounded-xl border border-app-border">
        {children}
      </div>
    </section>
  );
}

/** One setting: what it does on the left, its control on the right (below on phones). */
export function SecurityRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-app-text">{title}</p>
        {description && <p className="mt-0.5 text-xs text-app-text-secondary">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
