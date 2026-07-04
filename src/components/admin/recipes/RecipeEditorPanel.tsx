'use client';

import type { RefObject } from 'react';
import Link from 'next/link';
import { BookOpenCheck, Plus, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { Ingredient } from '@/types/inventory.types';
import RecipeLineRow from './RecipeLineRow';
import type { MenuItem, RecipeLine } from './types';

interface RecipeEditorPanelProps {
  panelRef: RefObject<HTMLDivElement | null>;
  selectedItemId: string | null;
  selectedItem: MenuItem | undefined;
  loadingRecipe: boolean;
  recipeLines: RecipeLine[];
  ingredients: Ingredient[];
  usedIngredientIds: Set<string>;
  canEdit: boolean;
  inventoryHref: string;
  saving: boolean;
  onUpdateLine: (lineId: string, field: string, value: string | number | '') => void;
  onRemoveLine: (lineId: string) => void;
  onAddLine: () => void;
  onSave: () => void;
}

export default function RecipeEditorPanel({
  panelRef,
  selectedItemId,
  selectedItem,
  loadingRecipe,
  recipeLines,
  ingredients,
  usedIngredientIds,
  canEdit,
  inventoryHref,
  saving,
  onUpdateLine,
  onRemoveLine,
  onAddLine,
  onSave,
}: RecipeEditorPanelProps) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');

  return (
    <div
      ref={panelRef}
      className="w-full lg:w-[26rem] shrink-0 bg-app-card rounded-xl border border-app-border overflow-hidden lg:flex lg:flex-col lg:min-h-0"
    >
      {selectedItemId && selectedItem ? (
        <div className="flex flex-col h-full lg:min-h-0">
          <div className="px-4 py-3 border-b border-app-border bg-app-bg">
            <h3 className="truncate font-bold text-sm text-app-text">
              <span className="sr-only">{t('recipeFor')} </span>
              {selectedItem.name}
            </h3>
          </div>

          {loadingRecipe ? (
            <div className="p-8 text-center text-app-text-secondary">{tc('loading')}</div>
          ) : (
            <div className="flex-1 min-h-0 p-4 space-y-4 overflow-y-auto max-h-[320px] lg:max-h-none">
              {recipeLines.map((line) => (
                <RecipeLineRow
                  key={line.lineId}
                  line={line}
                  ingredients={ingredients}
                  recipeLines={recipeLines}
                  usedIngredientIds={usedIngredientIds}
                  canEdit={canEdit}
                  onUpdateLine={onUpdateLine}
                  onRemoveLine={onRemoveLine}
                />
              ))}

              {recipeLines.length === 0 && (
                <p className="text-sm text-app-text-secondary text-center py-4">
                  {t('noIngredientDefined')}
                </p>
              )}

              {canEdit &&
                (ingredients.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-app-border p-4 text-center">
                    <p className="text-sm text-app-text-secondary">{t('addProductsFirst')}</p>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={inventoryHref}>{t('goToInventory')}</Link>
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={onAddLine} className="w-full gap-2">
                    <Plus className="w-4 h-4" />
                    {t('addIngredient2')}
                  </Button>
                ))}
            </div>
          )}

          {canEdit && (
            <div className="px-4 py-3 border-t border-app-border bg-app-bg">
              <Button onClick={onSave} disabled={saving} variant="default" className="w-full gap-2">
                <Check className="w-4 h-4" />
                {saving ? t('saving') : tc('save')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center p-12 text-app-text-secondary">
          <BookOpenCheck className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">{t('selectDish')}</p>
          <p className="text-xs mt-1">{t('defineRecipe')}</p>
        </div>
      )}
    </div>
  );
}
