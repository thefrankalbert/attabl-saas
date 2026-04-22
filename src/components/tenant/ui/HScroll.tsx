import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type HScrollProps = {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
};

export function HScroll({ children, className, ariaLabel }: HScrollProps) {
  return (
    <div
      role={ariaLabel ? 'region' : undefined}
      aria-label={ariaLabel}
      data-slot="h-scroll"
      className={cn(
        'flex gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}
