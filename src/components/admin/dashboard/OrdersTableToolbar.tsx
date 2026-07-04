'use client';

import type { Dispatch, SetStateAction } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Columns3, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ColKey, TabKey } from './orders-table.constants';

interface OrdersTableToolbarProps {
  tab: TabKey;
  counts: Record<TabKey, number>;
  onChangeTab: (key: TabKey) => void;
  cols: Record<ColKey, boolean>;
  setCols: Dispatch<SetStateAction<Record<ColKey, boolean>>>;
  adminBase: string;
}

export function OrdersTableToolbar({
  tab,
  counts,
  onChangeTab,
  cols,
  setCols,
  adminBase,
}: OrdersTableToolbarProps) {
  const t = useTranslations('admin');

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'all', label: t('tabAll') },
    { key: 'pending', label: t('tabPending') },
    { key: 'kitchen', label: t('tabKitchen') },
    { key: 'served', label: t('tabServed') },
    { key: 'cancelled', label: t('tabCancelled') },
  ];

  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="inline-flex gap-0.5 rounded-[0.625rem] bg-[var(--muted)] p-[3px]">
        {TABS.map(({ key, label }) => (
          <Button
            key={key}
            type="button"
            variant="ghost"
            onClick={() => onChangeTab(key)}
            className={cn(
              'h-auto gap-1.5 rounded-[0.4rem] px-2.5 py-1 text-[13px] font-normal hover:bg-transparent',
              tab === key
                ? 'bg-[var(--background)] font-medium text-[var(--foreground)] shadow-[0_1px_2px_rgb(0_0_0/0.06)]'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
            )}
          >
            {label}
            <span
              className={cn(
                'grid h-4 min-w-[18px] place-items-center rounded-full px-[5px] text-[11px]',
                tab === key
                  ? 'bg-[var(--secondary)] text-[var(--secondary-foreground)]'
                  : 'bg-[var(--muted-foreground)] text-[var(--background)]',
              )}
            >
              {counts[key]}
            </span>
          </Button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-8 gap-1.5 px-3 text-[13px] font-normal"
            >
              <Columns3 className="size-[15px] text-[var(--muted-foreground)]" />
              {t('colColumns')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('colColumns')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={cols.type}
              onCheckedChange={(v) => setCols((c) => ({ ...c, type: !!v }))}
            >
              {t('colType')}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={cols.payment}
              onCheckedChange={(v) => setCols((c) => ({ ...c, payment: !!v }))}
            >
              {t('colPayment')}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={cols.items}
              onCheckedChange={(v) => setCols((c) => ({ ...c, items: !!v }))}
            >
              {t('colItems')}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          asChild
          type="button"
          variant="outline"
          className="h-8 gap-1.5 px-3 text-[13px] font-normal"
        >
          <Link href={`${adminBase}/pos`}>
            <Plus className="size-[15px] text-[var(--muted-foreground)]" />
            {t('colAdd')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
