'use client';

import { Utensils, Edit2, Trash2, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Category } from '@/types/admin.types';
import type { MenuDetailVM } from './use-menu-detail';
import { MenuItemRow } from './MenuItemRow';

interface Props {
  vm: MenuDetailVM;
  cat: Category;
}

export function CategoryCard({ vm, cat }: Props) {
  const {
    t,
    expandedCategories,
    setExpandedCategories,
    toggleCategoryActive,
    openEditCategoryModal,
    handleDeleteCategory,
    getItemsForCategory,
  } = vm;

  const catItems = getItemsForCategory(cat.id);
  const isCatActive = cat.is_active ?? true;
  return (
    <div key={cat.id} className={cn('space-y-2', !isCatActive && 'opacity-50')}>
      {/* Category header - click to expand/collapse */}
      <div
        className="flex items-center gap-4 p-4 bg-app-card rounded-xl border border-app-border hover:bg-app-bg transition-colors group cursor-pointer"
        onClick={() =>
          setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(cat.id)) next.delete(cat.id);
            else next.add(cat.id);
            return next;
          })
        }
      >
        <div className="w-9 h-9 bg-app-bg rounded-lg flex items-center justify-center">
          <ChevronDown
            className={cn(
              'w-4 h-4 text-app-text-secondary transition-transform duration-200',
              !expandedCategories.has(cat.id) && '-rotate-90',
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-app-text text-sm">{cat.name}</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-app-text-secondary">
          <Utensils className="w-3.5 h-3.5" />
          <span className="font-medium">{t('dishCount', { count: catItems.length })}</span>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleCategoryActive(cat)}
            className="text-xs h-8"
            title={isCatActive ? t('categoryVisible') : t('categoryHidden')}
          >
            {isCatActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openEditCategoryModal(cat)}
            className="text-xs h-8"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDeleteCategory(cat)}
            title="Supprimer"
            className="text-xs h-8 text-[var(--destructive)] hover:bg-[var(--accent)]"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Items in this category - collapsible */}
      {catItems.length > 0 && expandedCategories.has(cat.id) && (
        <div className="ml-6 space-y-1">
          {catItems.map((item) => (
            <MenuItemRow key={item.id} vm={vm} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
