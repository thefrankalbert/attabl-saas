'use client';

import { useEffect, useState, useCallback } from 'react';
import { BookOpenCheck, Search, Plus, Trash2, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useIngredients } from '@/hooks/queries';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { createInventoryService } from '@/services/inventory.service';
import type { Recipe, RecipeLineInput } from '@/types/inventory.types';
import { INGREDIENT_UNITS } from '@/types/inventory.types';

interface RecipesClientProps {
  tenantId: string;
}

interface MenuItem {
  id: string;
  name: string;
  category_id: string | null;
  is_available: boolean;
}

interface RecipeLine {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  quantity_needed: number;
  notes: string;
}

export default function RecipesClient({ tenantId }: RecipesClientProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRecipe, setFilterRecipe] = useState<'all' | 'with' | 'without'>('all');

  // Recipe editing
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [recipeLines, setRecipeLines] = useState<RecipeLine[]>([]);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [saving, setSaving] = useState(false);

  // Track which items have recipes
  const [itemsWithRecipes, setItemsWithRecipes] = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const supabase = createClient();
  const inventoryService = createInventoryService(supabase);

  // TanStack Query for ingredients
  const { data: ingredients = [] } = useIngredients(tenantId);

  // TanStack Query for menu items and recipes
  const { data: recipeData, isLoading: loading } = useQuery({
    queryKey: ['recipes-data', tenantId],
    queryFn: async () => {
      const localSupabase = createClient();
      const [itemsRes, recipesRes] = await Promise.all([
        localSupabase
          .from('menu_items')
          .select('id, name, category_id, is_available')
          .eq('tenant_id', tenantId)
          .order('name'),
        localSupabase.from('recipes').select('menu_item_id').eq('tenant_id', tenantId),
      ]);

      const menuItemsList = (itemsRes.data as MenuItem[]) || [];
      const recipeIds = new Set(
        (recipesRes.data || []).map((r: { menu_item_id: string }) => r.menu_item_id),
      );
      return { menuItems: menuItemsList, recipeIds };
    },
    enabled: !!tenantId,
  });

  const menuItems = recipeData?.menuItems ?? [];

  // Sync recipeIds from query into local Set state
  useEffect(() => {
    if (recipeData?.recipeIds) {
      setItemsWithRecipes(recipeData.recipeIds);
    }
  }, [recipeData?.recipeIds]);

  // Load recipe for selected item
  const loadRecipe = useCallback(
    async (menuItemId: string) => {
      setLoadingRecipe(true);
      try {
        const recipes = await inventoryService.getRecipesForItem(menuItemId, tenantId);
        const lines: RecipeLine[] = recipes.map((r: Recipe) => ({
          ingredient_id: r.ingredient_id,
          ingredient_name: r.ingredient?.name || tc('unknown'),
          unit: r.ingredient?.unit || '',
          quantity_needed: r.quantity_needed,
          notes: r.notes || '',
        }));
        setRecipeLines(lines);
      } catch {
        toast({ title: t('loadingRecipeError'), variant: 'destructive' });
      } finally {
        setLoadingRecipe(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenantId, inventoryService, toast],
  );

  const handleSelectItem = (itemId: string) => {
    if (selectedItemId === itemId) {
      setSelectedItemId(null);
      setRecipeLines([]);
      return;
    }
    setSelectedItemId(itemId);
    loadRecipe(itemId);
  };

  const addLine = () => {
    if (ingredients.length === 0) {
      toast({ title: t('addProductsFirst'), variant: 'destructive' });
      return;
    }
    const firstIngredient = ingredients[0];
    setRecipeLines((prev) => [
      ...prev,
      {
        ingredient_id: firstIngredient.id,
        ingredient_name: firstIngredient.name,
        unit: firstIngredient.unit,
        quantity_needed: 0,
        notes: '',
      },
    ]);
  };

  const updateLine = (index: number, field: string, value: string | number) => {
    setRecipeLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        if (field === 'ingredient_id') {
          const ing = ingredients.find((ig) => ig.id === value);
          return {
            ...line,
            ingredient_id: value as string,
            ingredient_name: ing?.name || '',
            unit: ing?.unit || '',
          };
        }
        return { ...line, [field]: value };
      }),
    );
  };

  const removeLine = (index: number) => {
    setRecipeLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!selectedItemId) return;
    setSaving(true);
    try {
      const lines: RecipeLineInput[] = recipeLines
        .filter((l) => l.quantity_needed > 0)
        .map((l) => ({
          ingredient_id: l.ingredient_id,
          quantity_needed: l.quantity_needed,
          notes: l.notes || undefined,
        }));

      await inventoryService.setRecipe(tenantId, selectedItemId, lines);
      toast({ title: t('recipeSaved') });

      // Update itemsWithRecipes
      setItemsWithRecipes((prev) => {
        const next = new Set(prev);
        if (lines.length > 0) {
          next.add(selectedItemId);
        } else {
          next.delete(selectedItemId);
        }
        return next;
      });
    } catch {
      toast({ title: t('recipeSaveError'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Filtered items
  const filteredItems = menuItems.filter((item) => {
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterRecipe === 'with' && !itemsWithRecipes.has(item.id)) return false;
    if (filterRecipe === 'without' && itemsWithRecipes.has(item.id)) return false;
    return true;
  });

  const selectedItem = menuItems.find((m) => m.id === selectedItemId);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-app-text-secondary">
          {tc('loading')}
        </div>
      ) : (
        <>
          {/* Header + Filters — single line on desktop */}
          <div className="shrink-0 space-y-3">
            <div className="flex flex-col @lg:flex-row @lg:items-center gap-3">
              <h1 className="text-2xl font-bold text-app-text flex items-center gap-2 shrink-0">
                <BookOpenCheck className="w-6 h-6" />
                {t('recipesTech')}
                <span className="text-base font-normal text-app-text-secondary">
                  ({itemsWithRecipes.size}/{menuItems.length})
                </span>
              </h1>

              <div className="relative w-full @lg:w-56 @xl:w-64 shrink-0">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-app-text-muted" />
                <Input
                  data-search-input
                  placeholder={t('searchDish')}
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex gap-2 shrink-0">
                {(['all', 'with', 'without'] as const).map((f) => (
                  <Button
                    key={f}
                    variant={filterRecipe === f ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterRecipe(f)}
                    className="rounded-full"
                  >
                    {f === 'all' ? tc('all') : f === 'with' ? t('hasRecipe') : t('noRecipe')}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Layout: Items list + Recipe editor */}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6">
            <div className="flex flex-col @lg:flex-row gap-6">
              {/* Items List */}
              <div className="flex-1 bg-app-card rounded-xl border border-app-border overflow-hidden">
                <div className="max-h-[600px] overflow-y-auto divide-y divide-app-border">
                  {filteredItems.map((item) => {
                    const hasRecipe = itemsWithRecipes.has(item.id);
                    const isSelected = selectedItemId === item.id;

                    return (
                      <button
                        key={item.id}
                        onClick={() => handleSelectItem(item.id)}
                        className={cn(
                          'w-full text-left px-4 py-3 flex items-center justify-between transition-colors',
                          isSelected
                            ? 'bg-accent-muted border-l-4 border-accent'
                            : 'hover:bg-app-bg border-l-4 border-transparent',
                        )}
                      >
                        <div>
                          <p
                            className={cn(
                              'font-medium text-sm',
                              isSelected ? 'text-accent' : 'text-app-text',
                            )}
                          >
                            {item.name}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
                            hasRecipe
                              ? 'bg-green-500/10 text-green-500'
                              : 'bg-app-bg text-app-text-secondary',
                          )}
                        >
                          {hasRecipe ? t('hasRecipe') : t('noRecipe')}
                        </span>
                      </button>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <div className="px-4 py-12 text-center text-app-text-secondary">
                      {t('noDishFound')}
                    </div>
                  )}
                </div>
              </div>

              {/* Recipe Editor Panel */}
              <div className="@md:w-80 @lg:w-[28rem] bg-app-card rounded-xl border border-app-border overflow-hidden">
                {selectedItemId && selectedItem ? (
                  <div className="flex flex-col h-full">
                    <div className="px-4 py-3 border-b border-app-border bg-app-bg">
                      <h3 className="font-bold text-sm text-app-text">
                        {t('recipeFor')} {selectedItem.name}
                      </h3>
                    </div>

                    {loadingRecipe ? (
                      <div className="p-8 text-center text-app-text-secondary">{tc('loading')}</div>
                    ) : (
                      <div className="flex-1 p-4 space-y-4 overflow-y-auto max-h-[400px]">
                        {recipeLines.map((line, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 p-3 bg-app-bg rounded-lg border border-app-border"
                          >
                            <div className="flex-1 space-y-2">
                              <select
                                value={line.ingredient_id}
                                onChange={(e) => updateLine(idx, 'ingredient_id', e.target.value)}
                                className="w-full h-9 px-2 border border-app-border rounded-lg text-sm bg-app-card focus:outline-none focus:ring-1 focus:ring-accent/30"
                              >
                                {ingredients.map((ing) => (
                                  <option key={ing.id} value={ing.id}>
                                    {ing.name} ({INGREDIENT_UNITS[ing.unit]?.labelShort})
                                  </option>
                                ))}
                              </select>
                              <div className="flex gap-2">
                                <Input
                                  type="number"
                                  step="0.001"
                                  placeholder={t('qtyPlaceholder')}
                                  value={line.quantity_needed || ''}
                                  onChange={(e) =>
                                    updateLine(
                                      idx,
                                      'quantity_needed',
                                      parseFloat(e.target.value) || 0,
                                    )
                                  }
                                  className="h-8 text-sm flex-1"
                                />
                                <span className="text-xs text-app-text-secondary self-center w-10">
                                  {INGREDIENT_UNITS[line.unit as keyof typeof INGREDIENT_UNITS]
                                    ?.labelShort || line.unit}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => removeLine(idx)}
                              className="p-1.5 text-status-error hover:text-status-error hover:bg-status-error-bg rounded transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}

                        {recipeLines.length === 0 && (
                          <p className="text-sm text-app-text-secondary text-center py-4">
                            {t('noIngredientDefined')}
                          </p>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={addLine}
                          className="w-full gap-2"
                          disabled={ingredients.length === 0}
                        >
                          <Plus className="w-4 h-4" />
                          {t('addIngredient')}
                        </Button>
                      </div>
                    )}

                    {/* Save button */}
                    <div className="px-4 py-3 border-t border-app-border bg-app-bg">
                      <Button
                        onClick={handleSave}
                        disabled={saving}
                        variant="default"
                        className="w-full gap-2"
                      >
                        <Check className="w-4 h-4" />
                        {saving ? t('saving') : tc('save')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-12 text-app-text-secondary">
                    <BookOpenCheck className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-sm font-medium">{t('selectDish')}</p>
                    <p className="text-xs mt-1">{t('defineRecipe')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
