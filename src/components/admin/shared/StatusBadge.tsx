import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'success' | 'warning' | 'destructive' | 'info' | 'neutral';

const TONE_ICON: Record<BadgeTone, string> = {
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  destructive: 'text-[var(--destructive)]',
  info: 'text-[var(--c-emporter)]',
  neutral: 'text-[var(--muted-foreground)]',
};

interface StatusBadgeProps {
  /** Colors only the leading icon; label stays muted (dashboard "soft" badge) */
  tone?: BadgeTone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

/**
 * Canonical "soft" badge used across the admin, matching the dashboard
 * (OrdersTable) pattern: bordered, tokenized, light/dark-safe. Replaces the
 * legacy "full" pills (rounded-full + raw Tailwind color fills).
 */
export function StatusBadge({
  tone = 'neutral',
  icon: Icon,
  children,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[0.625rem] border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)] whitespace-nowrap',
        className,
      )}
    >
      {Icon && <Icon className={cn('size-[13px] shrink-0', TONE_ICON[tone])} />}
      {children}
    </span>
  );
}
