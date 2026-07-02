'use client';

import Link from 'next/link';
import { ArrowLeft, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MenuDetailVM } from './use-menu-detail';

interface Props {
  vm: MenuDetailVM;
}

export function MenuDetailHeader({ vm }: Props) {
  const { tenantSlug, t, menu, toggleMenuActive } = vm;

  return (
    <div className="shrink-0 flex items-center justify-between gap-3 mb-4 @sm:mb-6">
      <div className="flex items-center gap-2 text-sm min-w-0">
        <Link
          href={`/sites/${tenantSlug}/admin/menus`}
          className="hover:text-app-text text-app-text-secondary transition-colors flex items-center gap-1 shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('breadcrumbMenus')}
        </Link>
        <span className="text-app-text-secondary">/</span>
        <h1 className="text-app-text font-semibold break-words">{menu.name}</h1>
      </div>
      <Button
        variant="outline"
        onClick={toggleMenuActive}
        className={cn(
          'px-3 py-1.5 rounded-[0.625rem] text-xs font-medium h-auto shrink-0',
          menu.is_active
            ? 'border border-[var(--border)] text-[var(--success)]'
            : 'bg-app-bg text-app-text-secondary border-app-border',
        )}
      >
        {menu.is_active ? (
          <>
            <ToggleRight className="w-3 h-3 inline mr-1" />
            {t('active')}
          </>
        ) : (
          <>
            <ToggleLeft className="w-3 h-3 inline mr-1" />
            {t('inactive')}
          </>
        )}
      </Button>
    </div>
  );
}
