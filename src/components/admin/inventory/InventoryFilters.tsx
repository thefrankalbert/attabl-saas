'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface InventoryFiltersProps {
  filterStatus: 'all' | 'low' | 'out';
  setFilterStatus: (status: 'all' | 'low' | 'out') => void;
  lowCount: number;
  outCount: number;
  totalCount: number;
}

export default function InventoryFilters({
  filterStatus,
  setFilterStatus,
  lowCount,
  outCount,
  totalCount,
}: InventoryFiltersProps) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  return (
    <div className="flex items-center gap-1.5">
      {(['all', 'low', 'out'] as const).map((status) => {
        const count = status === 'low' ? lowCount : status === 'out' ? outCount : totalCount;
        return (
          <Button
            key={status}
            variant={filterStatus === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStatus(status)}
            className={cn(
              'rounded-full h-8 text-xs px-3 gap-1.5',
              status === 'out' &&
                outCount > 0 &&
                filterStatus !== status &&
                'border-[var(--border)] text-[var(--destructive)]',
              status === 'low' &&
                lowCount > 0 &&
                filterStatus !== status &&
                'border-[var(--border)] text-[var(--warning)]',
            )}
          >
            {status === 'all' ? tc('all') : status === 'low' ? t('lowStock') : t('rupture')}
            {status !== 'all' && count > 0 && (
              <span
                className={cn(
                  'inline-flex items-center justify-center rounded-full min-w-[18px] h-[18px] text-[10px] font-bold px-1',
                  filterStatus === status
                    ? 'bg-app-bg/30'
                    : status === 'out'
                      ? 'text-[var(--destructive)]'
                      : 'text-[var(--warning)]',
                )}
              >
                {count}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
