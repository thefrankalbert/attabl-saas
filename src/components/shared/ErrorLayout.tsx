import type { ReactNode } from 'react';
import { Coffee, Croissant, IceCream, Pizza, Soup, Wine } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'admin' | 'tenant';

interface ErrorLayoutProps {
  variant?: Variant;
  code?: string;
  brand?: ReactNode;
  title: string;
  description: string;
  actions: ReactNode;
  debug?: ReactNode;
}

const GRID_CELLS: Array<{ icon: typeof Pizza | null; filled: boolean }> = [
  { icon: Pizza, filled: true },
  { icon: null, filled: false },
  { icon: null, filled: false },
  { icon: Coffee, filled: true },
  { icon: null, filled: false },
  { icon: Soup, filled: true },
  { icon: Wine, filled: true },
  { icon: null, filled: false },
  { icon: Croissant, filled: true },
  { icon: null, filled: false },
  { icon: IceCream, filled: true },
  { icon: null, filled: false },
];

export function ErrorLayout({
  variant = 'admin',
  code,
  brand,
  title,
  description,
  actions,
  debug,
}: ErrorLayoutProps) {
  const isTenant = variant === 'tenant';

  return (
    <div
      className={cn(
        'h-full min-h-dvh w-full flex items-center justify-center p-6 sm:p-10',
        isTenant ? 'bg-white' : 'bg-white dark:bg-neutral-950',
      )}
    >
      <div className="w-full max-w-6xl grid gap-10 lg:gap-16 lg:grid-cols-2 items-center">
        <div className="order-2 lg:order-1 max-w-lg mx-auto lg:mx-0 text-center lg:text-left">
          {brand && (
            <div className="mb-8 flex items-center justify-center lg:justify-start">{brand}</div>
          )}
          {code && (
            <p
              className={cn(
                'font-[family-name:var(--font-sora)] text-7xl sm:text-8xl font-black tracking-tight leading-none',
                isTenant ? 'text-[#1A1A1A]' : 'text-neutral-900 dark:text-white',
              )}
            >
              {code}
            </p>
          )}
          <h1
            className={cn(
              'mt-4 text-2xl sm:text-3xl font-bold tracking-tight',
              isTenant
                ? 'text-[#1A1A1A]'
                : 'font-[family-name:var(--font-sora)] text-neutral-900 dark:text-white',
            )}
          >
            {title}
          </h1>
          <p
            className={cn(
              'mt-3 text-sm sm:text-base leading-relaxed',
              isTenant ? 'text-[#737373]' : 'text-neutral-600 dark:text-neutral-400',
            )}
          >
            {description}
          </p>
          {debug && <div className="mt-5">{debug}</div>}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
            {actions}
          </div>
        </div>

        <div className="order-1 lg:order-2 flex items-center justify-center">
          <div className="grid grid-cols-4 gap-4 sm:gap-6 w-full max-w-md">
            {GRID_CELLS.map((cell, i) => {
              const Icon = cell.icon;
              return (
                <div
                  key={i}
                  className={cn(
                    'aspect-square rounded-full flex items-center justify-center',
                    cell.filled
                      ? isTenant
                        ? 'bg-[#E6F9F0]'
                        : 'bg-[#CCFF00]/10 dark:bg-[#CCFF00]/15'
                      : isTenant
                        ? 'bg-[#F6F6F6] border border-[#EEEEEE]'
                        : 'bg-neutral-100 border border-neutral-200 dark:bg-white/5 dark:border-white/10',
                  )}
                >
                  {Icon && (
                    <Icon
                      className={cn(
                        'h-6 w-6 sm:h-8 sm:w-8',
                        isTenant ? 'text-[#1A1A1A]' : 'text-[#4d7c0f] dark:text-[#CCFF00]',
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
