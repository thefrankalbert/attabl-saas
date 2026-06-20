'use client';

import { Calendar, ChevronDown, CalendarCheck, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const PERIODS = [
  { key: 'today', labelKey: 'periodToday', icon: CalendarCheck },
  { key: 'yesterday', labelKey: 'periodYesterday', icon: RotateCcw },
  { key: '7d', labelKey: 'period7d', icon: Calendar },
  { key: '30d', labelKey: 'period30d', icon: Calendar },
] as const;

/**
 * Header period selector (maquette .date-btn). Writes the chosen range to the
 * `?range=` URL param; the dashboard orders table reads it to scope by date.
 * Portals outside .admin-shell, so the content carries the theme classes.
 */
export function HeaderDateFilter({ isDark = false }: { isDark?: boolean }) {
  const t = useTranslations('admin');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get('range') || 'today';
  const labelKey = PERIODS.find((p) => p.key === current)?.labelKey ?? 'periodToday';

  const select = (key: string) => {
    const next = new URLSearchParams(params.toString());
    if (key === 'today') next.delete('range');
    else next.set('range', key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="hidden h-8 gap-1.5 px-2.5 text-[13px] font-normal sm:inline-flex"
        >
          <Calendar className="size-[15px] text-[var(--muted-foreground)]" />
          {t(labelKey)}
          <ChevronDown className="size-[15px] text-[var(--muted-foreground)]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className={cn('admin-shell w-[250px] p-2.5', isDark && 'dark')}>
        <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.05em] text-[var(--muted-foreground)]">
          {t('periodLabel')}
        </div>
        <div className="flex flex-col gap-0.5">
          {PERIODS.map(({ key, labelKey: lk, icon: Icon }) => (
            <Button
              key={key}
              type="button"
              variant="ghost"
              onClick={() => select(key)}
              className={cn(
                'h-auto justify-start gap-2 px-2 py-[7px] text-[13px] font-normal',
                current === key
                  ? 'bg-[var(--accent)] font-medium text-[var(--foreground)]'
                  : 'text-[var(--foreground)] hover:bg-[var(--accent)]',
              )}
            >
              <Icon className="size-[15px] text-[var(--muted-foreground)]" />
              {t(lk)}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
