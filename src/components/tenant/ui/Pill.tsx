import * as React from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

type PillProps = React.ComponentProps<'span'> & {
  variant?: 'default' | 'lock' | 'success' | 'warn' | 'danger';
  icon?: React.ReactNode;
};

const variantClass: Record<NonNullable<PillProps['variant']>, string> = {
  default: 'bg-[color:var(--cream)] text-[color:var(--navy)]',
  lock: 'bg-[color:var(--cream)] text-[color:var(--navy)]',
  success: 'bg-[color:var(--success-refonte)]/10 text-[color:var(--success-refonte)]',
  warn: 'bg-[color:var(--warn-refonte)]/10 text-[color:var(--warn-refonte)]',
  danger: 'bg-[color:var(--danger-refonte)]/10 text-[color:var(--danger-refonte)]',
};

export function Pill({ className, variant = 'default', icon, children, ...props }: PillProps) {
  const resolvedIcon =
    icon ?? (variant === 'lock' ? <Lock className="h-3.5 w-3.5" aria-hidden /> : null);
  return (
    <span
      data-slot="pill"
      data-variant={variant}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-normal tracking-tight',
        variantClass[variant],
        className,
      )}
      {...props}
    >
      {resolvedIcon}
      {children}
    </span>
  );
}
