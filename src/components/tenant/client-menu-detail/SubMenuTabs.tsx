'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Menu } from '@/types/admin.types';

interface SubMenuTabsProps {
  activeMenu: Menu;
  transversalMenus: Menu[];
  activeSubMenuId: string | null;
  lang: 'fr' | 'en';
  onSelectSubMenu: (id: string | null) => void;
}

export default function SubMenuTabs({
  activeMenu,
  transversalMenus,
  activeSubMenuId,
  lang,
  onSelectSubMenu,
}: SubMenuTabsProps) {
  const t = useTranslations('tenant');

  return (
    <div className="px-4 mb-3">
      <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
        <Button
          variant="ghost"
          onClick={() => onSelectSubMenu(null)}
          className={cn(
            'flex-shrink-0 px-4 py-2 rounded-full whitespace-nowrap h-auto text-[11px] font-medium uppercase tracking-[1px]',
            !activeSubMenuId ? 'bg-[#1A1A1A] text-white' : 'bg-[#F6F6F6] text-[#B0B0B0]',
          )}
        >
          {t('all')}
        </Button>
        {(activeMenu.children || [])
          .filter((c) => c.is_active)
          .map((child) => (
            <Button
              key={child.slug}
              variant="ghost"
              onClick={() => onSelectSubMenu(child.id)}
              className={cn(
                'flex-shrink-0 px-4 py-2 rounded-full whitespace-nowrap h-auto text-[11px] font-medium uppercase tracking-[1px]',
                activeSubMenuId === child.id
                  ? 'bg-[#1A1A1A] text-white'
                  : 'bg-[#F6F6F6] text-[#B0B0B0]',
              )}
            >
              {child.name}
            </Button>
          ))}
        {transversalMenus.map((tm) => (
          <Button
            key={tm.slug}
            variant="ghost"
            onClick={() => onSelectSubMenu(tm.id)}
            className={cn(
              'flex-shrink-0 px-4 py-2 rounded-full whitespace-nowrap h-auto text-[11px] font-medium uppercase tracking-[1px]',
              activeSubMenuId === tm.id ? 'bg-[#1A1A1A] text-white' : 'bg-[#F6F6F6] text-[#B0B0B0]',
            )}
          >
            {lang === 'en' && tm.name_en ? tm.name_en : tm.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
