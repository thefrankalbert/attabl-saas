'use client';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Segmented toggle (language / currency): active pill = ink, inactive = muted.
export function SegmentedToggle({
  options,
  active,
  onSelect,
  label,
}: {
  options: { value: string; label: string }[];
  active: string;
  onSelect: (value: string) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-[3px] rounded-[var(--radius-pill)] border border-[var(--color-divider)] bg-[var(--color-surface-alt)] p-[3px]"
    >
      {options.map((o) => {
        const on = active === o.value;
        return (
          <Button
            key={o.value}
            variant="ghost"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(o.value)}
            className={cn(
              'h-auto rounded-[var(--radius-pill)] px-[11px] py-[5px] text-[12px] font-semibold hover:bg-transparent',
              on
                ? 'bg-[var(--color-ink)] text-white hover:bg-[var(--color-ink)]'
                : 'text-[var(--color-ink-muted)]',
            )}
          >
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}

// Reusable info/action row inside a card.
export function SettingsRow({
  icon,
  label,
  subtitle,
  onClick,
  trailing,
  disabled,
  switchChecked,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
  disabled?: boolean;
  /** When set, the row acts as an accessible switch (announces on/off state). */
  switchChecked?: boolean;
}) {
  const content = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-search)] bg-[var(--color-surface-alt)] text-[var(--color-ink-2)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13.5px] font-semibold tracking-[-0.2px] text-[var(--color-ink)]">
          {label}
        </span>
        <span className="mt-px block truncate text-[11.5px] text-[var(--color-ink-muted)]">
          {subtitle}
        </span>
      </span>
      <span className="shrink-0">
        {trailing ?? <ChevronRight className="h-[18px] w-[18px] text-[var(--color-ink-soft)]" />}
      </span>
    </>
  );

  if (onClick) {
    return (
      <Button
        variant="ghost"
        onClick={onClick}
        disabled={disabled}
        role={switchChecked === undefined ? undefined : 'switch'}
        aria-checked={switchChecked}
        className={cn(
          'flex h-auto w-full items-center justify-start gap-3 rounded-none px-[14px] py-[13px] hover:bg-[var(--color-surface-alt)]',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {content}
      </Button>
    );
  }

  return <div className="flex w-full items-center gap-3 px-[14px] py-[13px]">{content}</div>;
}

export function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 px-[6px] font-mono text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-ink-soft)]">
        {title}
      </h2>
      <section className="divide-y divide-[var(--color-divider)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white">
        {children}
      </section>
    </div>
  );
}
