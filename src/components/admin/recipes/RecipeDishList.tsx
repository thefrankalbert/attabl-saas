'use client';

import { Circle, CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MenuItem } from './types';

interface RecipeDishListProps {
  filteredItems: MenuItem[];
  itemsWithRecipes: Set<string>;
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
}

export default function RecipeDishList({
  filteredItems,
  itemsWithRecipes,
  selectedItemId,
  onSelectItem,
}: RecipeDishListProps) {
  const t = useTranslations('inventory');

  return (
    <div className="flex-1 min-w-0 bg-app-card rounded-xl border border-app-border overflow-hidden lg:flex lg:flex-col lg:min-h-0">
      <div className="max-h-[420px] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto divide-y divide-app-border">
        {filteredItems.map((item) => {
          const hasRecipe = itemsWithRecipes.has(item.id);
          const isSelected = selectedItemId === item.id;

          return (
            <Button
              key={item.id}
              variant="ghost"
              onClick={() => onSelectItem(item.id)}
              className={cn(
                'w-full text-left px-4 py-3 h-auto flex items-center gap-3 transition-colors rounded-none',
                isSelected ? 'bg-accent-muted' : 'hover:bg-app-bg',
              )}
            >
              {hasRecipe ? (
                <CircleCheck aria-hidden className="h-4 w-4 shrink-0 text-status-success" />
              ) : (
                <Circle aria-hidden className="h-4 w-4 shrink-0 text-app-text-muted/60" />
              )}
              <span className="sr-only">{hasRecipe ? t('hasRecipe') : t('noRecipe')}</span>
              <p
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  isSelected ? 'font-semibold text-accent' : 'font-medium text-app-text',
                )}
              >
                {item.name}
              </p>
            </Button>
          );
        })}
        {filteredItems.length === 0 && (
          <div className="px-4 py-12 text-center text-app-text-secondary">{t('noDishFound')}</div>
        )}
      </div>
    </div>
  );
}
