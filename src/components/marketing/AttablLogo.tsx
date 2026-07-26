import { Utensils } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Attabl wordmark: dark rounded square holding the utensils glyph + "Attabl".
 * Sizes track the design (nav 26px mark / 18px text, footer 24px / 17px).
 */
export function AttablLogo({
  size = 'nav',
  className,
}: {
  size?: 'nav' | 'footer';
  className?: string;
}) {
  const isNav = size === 'nav';
  return (
    <span className={cn('inline-flex items-center gap-[9px]', className)}>
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-lg bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900',
          isNav ? 'h-[26px] w-[26px]' : 'h-6 w-6',
        )}
      >
        <Utensils className={isNav ? 'h-[15px] w-[15px]' : 'h-3.5 w-3.5'} strokeWidth={2} />
      </span>
      <span
        className={cn(
          'font-semibold tracking-[-0.02em] text-zinc-950 dark:text-zinc-50',
          isNav ? 'text-lg' : 'text-[17px]',
        )}
      >
        Attabl
      </span>
    </span>
  );
}
