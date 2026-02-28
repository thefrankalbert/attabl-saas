import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-action-primary/10 text-text-accent',
        secondary: 'border-border-default bg-surface-secondary text-text-secondary',
        destructive: 'border-red-200/50 bg-status-error-bg text-status-error',
        outline: 'text-text-primary border-border-default',
        success: 'border-emerald-200/50 bg-status-success-bg text-status-success',
        warning: 'border-amber-200/50 bg-status-warning-bg text-status-warning',
        info: 'border-blue-200/50 bg-status-info-bg text-status-info',
        muted: 'border-transparent bg-surface-tertiary text-text-muted',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
