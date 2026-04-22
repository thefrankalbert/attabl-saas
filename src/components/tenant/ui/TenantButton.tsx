import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

// Refonte-scoped button. Wraps a native button element but enforces the
// Blutable refonte visual (navy primary, gold-bordered ghost, min 48px h).
// Kept separate from src/components/ui/button to avoid touching shadcn.
const tenantButtonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold tracking-tight transition-colors duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gold)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bone)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 min-h-[44px]',
  {
    variants: {
      variant: {
        primary: 'bg-[color:var(--navy)] text-[color:var(--bone)] hover:bg-[color:var(--navy-80)]',
        ghost:
          'border border-[color:var(--gold)] bg-transparent text-[color:var(--navy)] hover:bg-[color:var(--cream)]',
        soft: 'bg-[color:var(--cream)] text-[color:var(--navy)] hover:bg-[color:var(--gold-soft)]',
      },
      size: {
        default: 'h-12 px-6 text-sm rounded-[14px]',
        sm: 'h-11 px-4 text-sm rounded-[10px]',
        lg: 'h-14 px-8 text-base rounded-[20px]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

type TenantButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof tenantButtonVariants> & {
    asChild?: boolean;
  };

export function TenantButton({
  className,
  variant = 'primary',
  size = 'default',
  asChild = false,
  ...props
}: TenantButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="tenant-button"
      data-variant={variant}
      data-size={size}
      className={cn(tenantButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { tenantButtonVariants };
