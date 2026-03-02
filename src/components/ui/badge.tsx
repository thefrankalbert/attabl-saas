import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent-muted text-accent',
        secondary: 'border-app-border bg-app-elevated text-app-text-secondary',
        destructive: 'border-transparent bg-status-error-bg text-status-error',
        outline: 'text-app-text border-app-border',
        success: 'border-transparent bg-status-success-bg text-status-success',
        warning: 'border-transparent bg-status-warning-bg text-status-warning',
        info: 'border-transparent bg-status-info-bg text-status-info',
        muted: 'border-transparent bg-app-elevated text-app-text-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
