'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { BookOpenCheck, Search, Plus, Trash2, Check } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIngredients } from '@/hooks/queries';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { createInventoryService } from '@/services/inventory.service';
import { actionSetRecipe } from '@/app/actions/inventory';
import { ServiceError } from '@/services/errors';
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
  lineId: string;
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  quantity_needed: number | string;
  notes: string;
}

const EMPTY_RECIPE_IDS = new Set<string>();

function newLineId(): string {
  return `line-${crypto.randomUUID()}`;
}

function parseQuantity(value: number | string): number {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function RecipesClient({ tenantId }: RecipesClientProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRecipe, setFilterRecipe] = useState<'all' | 'with' | 'without'>('all');

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [recipeLines, setRecipeLines] = useState<RecipeLine[]>([]);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const params = useParams();
  const siteSlug = typeof params?.site === 'string' ? params.site : '';
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can('canManageStocks');

  const supabase = createClient();
  const inventoryService = useMemo(() => createInventoryService(supabase), [supabase]);

  const { data: ingredients = [] } = useIngredients(tenantId);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { data: recipeData, isLoading: isQueryLoading } = useQuery({
    queryKey: ['recipes-data', tenantId],
    queryFn: async () => {
      const svc = createInventoryService(createClient());
      const { menuItems, recipeItemIds } = await svc.getRecipesOverview(tenantId);
      return { menuItems: menuItems as MenuItem[], recipeIds: recipeItemIds };
    },
    enabled: !!tenantId,
  });

  const loading = !isMounted || isQueryLoading;

  const menuItems = recipeData?.menuItems ?? [];
  const rawRecipeIds = recipeData?.recipeIds;
  const itemsWithRecipes: Set<string> =
    rawRecipeIds instanceof Set ? rawRecipeIds : EMPTY_RECIPE_IDS;

  const loadRecipe = useCallback(
    async (menuItemId: string) => {
      setLoadingRecipe(true);
      try {
        const recipes = await inventoryService.getRecipesForItem(menuItemId, tenantId);
        const lines: RecipeLine[] = recipes.map((r: Recipe) => ({
          lineId: newLineId(),
          ingredient_id: r.ingredient_id,
          ingredient_name: r.ingredient?.name || tc('unknown'),
          unit: r.ingredient?.unit || '',
          quantity_needed: r.quantity_needed,
          notes: r.notes || '',
        }));
        setRecipeLines(lines);
      } catch (err) {
        const message = err instanceof ServiceError ? err.message : t('loadingRecipeError');
        toast({ title: message, variant: 'destructive' });
      } finally {
        setLoadingRecipe(false);
      }
    },
    [tenantId, inventoryService, toast, t, tc],
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

  const usedIngredientIds = useMemo(
    () => new Set(recipeLines.map((line) => line.ingredient_id)),
    [recipeLines],
  );

  const addLine = () => {
    if (!canEdit) return;
    if (ingredients.length === 0) {
      toast({ title: t('addProductsFirst'), variant: 'destructive' });
      return;
    }
    const nextIngredient = ingredients.find((ing) => !usedIngredientIds.has(ing.id));
    if (!nextIngredient) {
      toast({ title: t('recipeAllIngredientsUsed'), variant: 'destructive' });
      return;
    }
    setRecipeLines((prev) => [
      ...prev,
      {
        lineId: newLineId(),
        ingredient_id: nextIngredient.id,
        ingredient_name: nextIngredient.name,
        unit: nextIngredient.unit,
        quantity_needed: '',
        notes: '',
      },
    ]);
  };

  const updateLine = (lineId: string, field: string, value: string | number | '') => {
    setRecipeLines((prev) =>
      prev.map((line) => {
        if (line.lineId !== lineId) return line;
        if (field === 'ingredient_id') {
          const ingredientId = value as string;
          if (prev.some((l) => l.lineId !== lineId && l.ingredient_id === ingredientId)) {
            return line;
          }
          const ing = ingredients.find((ig) => ig.id === ingredientId);
          return {
            ...line,
            ingredient_id: ingredientId,
            ingredient_name: ing?.name || '',
            unit: ing?.unit || '',
          };
        }
        return { ...line, [field]: value };
      }),
    );
  };

  const removeLine = (lineId: string) => {
    if (!canEdit) return;
    setRecipeLines((prev) => prev.filter((line) => line.lineId !== lineId));
  };

  const handleSave = async () => {
    if (!selectedItemId || !canEdit) return;

    const linesToSave = recipeLines.filter((line) => parseQuantity(line.quantity_needed) > 0);

    if (recipeLines.length > 0 && linesToSave.length === 0) {
      toast({ title: t('recipeQtyRequired'), variant: 'destructive' });
      return;
    }

    const ingredientIds = linesToSave.map((line) => line.ingredient_id);
    if (new Set(ingredientIds).size !== ingredientIds.length) {
      toast({ title: t('recipeDuplicateIngredient'), variant: 'destructive' });
      return;
    }

    const payload: RecipeLineInput[] = linesToSave.map((line) => ({
      ingredient_id: line.ingredient_id,
      quantity_needed: parseQuantity(line.quantity_needed),
      notes: line.notes.trim() || undefined,
    }));

    setSaving(true);
    try {
      const r = await actionSetRecipe(tenantId, selectedItemId, payload);
      if (r.error) throw new Error(r.error);
      toast({ title: t('recipeSaved') });

      queryClient.setQueryData(
        ['recipes-data', tenantId],
        (prev: { menuItems: MenuItem[]; recipeIds: Set<string> } | undefined) => {
          if (!prev) return prev;
          const recipeIds = new Set(prev.recipeIds);
          if (payload.length > 0) {
            recipeIds.add(selectedItemId);
          } else {
            recipeIds.delete(selectedItemId);
          }
          return { ...prev, recipeIds };
        },
      );

      await queryClient.invalidateQueries({ queryKey: ['recipes-data', tenantId] });
      await loadRecipe(selectedItemId);
    } catch (err) {
      const message = err instanceof ServiceError ? err.message : t('recipeSaveError');
      toast({ title: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = menuItems.filter((item) => {
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterRecipe === 'with' && !itemsWithRecipes.has(item.id)) return false;
    if (filterRecipe === 'without' && itemsWithRecipes.has(item.id)) return false;
    return true;
  });

  const selectedItem = menuItems.find((m) => m.id === selectedItemId);
  const inventoryHref = siteSlug ? `/sites/${siteSlug}/admin/inventory` : '/admin/inventory';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0">
        <AdminPageHeader
          title={t('recipesTech')}
          subtitle={t('recipesSubtitle')}
          actions={
            <>
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
            </>
          }
        />
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-app-text-secondary">
          {tc('loading')}
        </div>
      ) : (
        <>
          {(ingredients.length === 0 || !canEdit) && (
            <div className="shrink-0 mt-4 space-y-4">
              {ingredients.length === 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-app-text-secondary">
                  <span>{t('addProductsFirst')}</span>
                  {siteSlug && (
                    <Button variant="link" size="sm" className="h-auto p-0" asChild>
                      <Link href={inventoryHref}>{t('goToInventory')}</Link>
                    </Button>
                  )}
                </div>
              )}
              {!canEdit && (
                <p className="text-sm text-app-text-secondary">{t('recipeReadOnlyHint')}</p>
              )}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 @sm:mt-6 pb-4">
            <div className="flex flex-col @lg:flex-row gap-6">
              <div className="flex-1 bg-app-card rounded-xl border border-app-border overflow-hidden">
                <div className="max-h-[400px] @md:max-h-[600px] overflow-y-auto divide-y divide-app-border">
                  {filteredItems.map((item) => {
                    const hasRecipe = itemsWithRecipes.has(item.id);
                    const isSelected = selectedItemId === item.id;

                    return (
                      <Button
                        key={item.id}
                        variant="ghost"
                        onClick={() => handleSelectItem(item.id)}
                        className={cn(
                          'w-full text-left px-4 py-3 h-auto flex items-center justify-between transition-colors rounded-none',
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
                              ? 'border border-[var(--border)] text-[var(--success)]'
                              : 'bg-app-bg text-app-text-secondary',
                          )}
                        >
                          {hasRecipe ? t('hasRecipe') : t('noRecipe')}
                        </span>
                      </Button>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <div className="px-4 py-12 text-center text-app-text-secondary">
                      {t('noDishFound')}
                    </div>
                  )}
                </div>
              </div>

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
                      <div className="flex-1 p-4 space-y-4 overflow-y-auto max-h-[300px] @md:max-h-[400px]">
                        {recipeLines.map((line) => {
                          const availableIngredients = ingredients.filter(
                            (ing) =>
                              ing.id === line.ingredient_id || !usedIngredientIds.has(ing.id),
                          );

                          return (
                            <div
                              key={line.lineId}
                              className="flex items-start gap-2 p-3 bg-app-bg rounded-lg border border-app-border"
                            >
                              <div className="flex-1 space-y-2">
                                <Select
                                  value={line.ingredient_id}
                                  onValueChange={(val) => {
                                    const alreadyUsed = recipeLines.some(
                                      (l) => l.lineId !== line.lineId && l.ingredient_id === val,
                                    );
                                    if (alreadyUsed) {
                                      toast({
                                        title: t('recipeDuplicateIngredient'),
                                        variant: 'destructive',
                                      });
                                      return;
                                    }
                                    updateLine(line.lineId, 'ingredient_id', val);
                                  }}
                                  disabled={!canEdit}
                                >
                                  <SelectTrigger className="w-full h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableIngredients.map((ing) => (
                                      <SelectItem key={ing.id} value={ing.id}>
                                        {ing.name} ({INGREDIENT_UNITS[ing.unit]?.labelShort})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <div className="flex gap-2">
                                  <Input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    placeholder={t('qtyPlaceholder')}
                                    value={line.quantity_needed === 0 ? '' : line.quantity_needed}
                                    onChange={(e) =>
                                      updateLine(
                                        line.lineId,
                                        'quantity_needed',
                                        e.target.value === '' ? '' : parseFloat(e.target.value),
                                      )
                                    }
                                    disabled={!canEdit}
                                    className="h-8 text-sm flex-1"
                                  />
                                  <span className="text-xs text-app-text-secondary self-center w-10">
                                    {INGREDIENT_UNITS[line.unit as keyof typeof INGREDIENT_UNITS]
                                      ?.labelShort || line.unit}
                                  </span>
                                </div>
                                <Textarea
                                  placeholder={t('notesOptional')}
                                  value={line.notes}
                                  onChange={(e) => updateLine(line.lineId, 'notes', e.target.value)}
                                  disabled={!canEdit}
                                  rows={2}
                                  className="text-sm min-h-0 resize-none"
                                />
                              </div>
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={tc('delete')}
                                  onClick={() => removeLine(line.lineId)}
                                  className="p-1.5 h-auto w-auto text-status-error hover:text-status-error hover:bg-status-error-bg rounded transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          );
                        })}

                        {recipeLines.length === 0 && (
                          <p className="text-sm text-app-text-secondary text-center py-4">
                            {t('noIngredientDefined')}
                          </p>
                        )}

                        {canEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={addLine}
                            className="w-full gap-2"
                            disabled={ingredients.length === 0}
                          >
                            <Plus className="w-4 h-4" />
                            {t('addIngredient2')}
                          </Button>
                        )}
                      </div>
                    )}

                    {canEdit && (
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
                    )}
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
