import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const chipVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-normal transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gold)]/40',
  {
    variants: {
      variant: {
        default:
          'bg-[color:var(--cream)] text-[color:var(--navy)] hover:bg-[color:var(--gold-soft)]',
        active: 'bg-[color:var(--gold-soft)] text-[color:var(--navy)]',
        outline:
          'border border-[color:var(--line)] bg-transparent text-[color:var(--navy-80)] hover:border-[color:var(--gold)] hover:text-[color:var(--navy)]',
      },
      size: {
        default: 'h-9 px-4 text-sm',
        sm: 'h-7 px-3 text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ChipProps = React.ComponentProps<'button'> & VariantProps<typeof chipVariants>;

export function Chip({
  className,
  variant = 'default',
  size = 'default',
  type = 'button',
  ...props
}: ChipProps) {
  return (
    <button
      type={type}
      data-slot="chip"
      data-variant={variant}
      className={cn(chipVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { chipVariants };
