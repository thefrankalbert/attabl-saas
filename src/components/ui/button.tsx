import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-colors duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-primary/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-action-secondary text-white hover:bg-[#1f2937]',
        destructive: 'bg-action-danger text-white hover:bg-red-600',
        outline:
          'border border-border-default bg-transparent text-text-secondary hover:bg-surface-secondary hover:border-border-strong',
        secondary: 'bg-surface-tertiary text-text-primary hover:bg-border-default',
        ghost: 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
        link: 'text-text-accent underline-offset-4 hover:underline',
        lime: 'bg-action-primary text-text-primary font-semibold hover:bg-action-primary-hover',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3',
        lg: 'h-11 rounded-lg px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
