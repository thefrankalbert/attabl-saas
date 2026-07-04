'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIngredients } from '@/hooks/queries';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import AdminModal from '@/components/admin/AdminModal';
import RecipeImportExcel from '@/components/features/inventory/RecipeImportExcel';
import { useTranslations } from 'next-intl';
import { createInventoryService } from '@/services/inventory.service';
import { actionSetRecipe } from '@/app/actions/inventory';
import { ServiceError } from '@/services/errors';
import type { Recipe, RecipeLineInput } from '@/types/inventory.types';
import RecipesToolbar from '@/components/admin/recipes/RecipesToolbar';
import RecipeDishList from '@/components/admin/recipes/RecipeDishList';
import RecipeEditorPanel from '@/components/admin/recipes/RecipeEditorPanel';
import {
  EMPTY_RECIPE_IDS,
  newLineId,
  parseQuantity,
  type MenuItem,
  type RecipeFilter,
  type RecipeLine,
} from '@/components/admin/recipes/types';

interface RecipesClientProps {
  tenantId: string;
}

export default function RecipesClient({ tenantId }: RecipesClientProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRecipe, setFilterRecipe] = useState<RecipeFilter>('all');
  const [showImportModal, setShowImportModal] = useState(false);

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

  const {
    data: ingredients = [],
    isError: ingredientsError,
    refetch: refetchIngredients,
  } = useIngredients(tenantId);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const {
    data: recipeData,
    isLoading: isQueryLoading,
    isError: overviewError,
    refetch: refetchOverview,
  } = useQuery({
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

  // Guards against out-of-order responses: only the latest load may write state
  // (two quick clicks on different dishes would otherwise show dish A's recipe
  // under dish B's title when the slower request resolves last).
  const loadSeqRef = useRef(0);

  const loadRecipe = useCallback(
    async (menuItemId: string) => {
      const seq = ++loadSeqRef.current;
      setLoadingRecipe(true);
      try {
        const recipes = await inventoryService.getRecipesForItem(menuItemId, tenantId);
        if (seq !== loadSeqRef.current) return;
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
        if (seq !== loadSeqRef.current) return;
        const message = err instanceof ServiceError ? err.message : t('loadingRecipeError');
        toast({ title: message, variant: 'destructive' });
      } finally {
        if (seq === loadSeqRef.current) setLoadingRecipe(false);
      }
    },
    [tenantId, inventoryService, toast, t, tc],
  );

  const editorPanelRef = useRef<HTMLDivElement | null>(null);

  const handleSelectItem = (itemId: string) => {
    if (selectedItemId === itemId) {
      loadSeqRef.current += 1;
      setSelectedItemId(null);
      setRecipeLines([]);
      setLoadingRecipe(false);
      return;
    }
    setSelectedItemId(itemId);
    loadRecipe(itemId);
    // On stacked layouts (mobile/tablet) the editor panel sits below the list,
    // out of view - bring it into view so tapping a dish gives visible feedback.
    // block:'nearest' makes this a no-op on the side-by-side desktop layout.
    requestAnimationFrame(() => {
      editorPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const usedIngredientIds = useMemo(
    () => new Set(recipeLines.map((line) => line.ingredient_id)),
    [recipeLines],
  );

  const addLine = () => {
    if (!canEdit) return;
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

  const handleImportComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['recipes-data', tenantId] });
    refetchIngredients();
    if (selectedItemId) loadRecipe(selectedItemId);
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
      <div className="shrink-0 space-y-4">
        <AdminPageHeader title={t('recipesTech')} />

        <RecipesToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterRecipe={filterRecipe}
          onFilterChange={setFilterRecipe}
          canEdit={canEdit}
          onImportClick={() => setShowImportModal(true)}
        />
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-app-text-secondary">
          {tc('loading')}
        </div>
      ) : overviewError || ingredientsError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle className="w-10 h-10 text-app-text-muted" />
          <p className="text-sm text-status-error">{tc('loadingError')}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (overviewError) refetchOverview();
              if (ingredientsError) refetchIngredients();
            }}
          >
            {tc('retry')}
          </Button>
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
          {/* Stacked (mobile/tablet): this wrapper is THE single page scroller.
              Side-by-side (@3xl): wrapper stops scrolling, each panel fills the
              height and scrolls its own list internally - no nested scroll. */}
          <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden scrollbar-hide mt-4 sm:mt-6 pb-4 lg:pb-0">
            <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:h-full lg:min-h-0">
              <RecipeDishList
                filteredItems={filteredItems}
                itemsWithRecipes={itemsWithRecipes}
                selectedItemId={selectedItemId}
                onSelectItem={handleSelectItem}
              />

              <RecipeEditorPanel
                panelRef={editorPanelRef}
                selectedItemId={selectedItemId}
                selectedItem={selectedItem}
                loadingRecipe={loadingRecipe}
                recipeLines={recipeLines}
                ingredients={ingredients}
                usedIngredientIds={usedIngredientIds}
                canEdit={canEdit}
                inventoryHref={inventoryHref}
                saving={saving}
                onUpdateLine={updateLine}
                onRemoveLine={removeLine}
                onAddLine={addLine}
                onSave={handleSave}
              />
            </div>
          </div>
        </>
      )}

      {/* Import fiches techniques Modal */}
      <AdminModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title={t('importTechnicalSheets')}
        size="lg"
      >
        {showImportModal && (
          <RecipeImportExcel
            onImportComplete={handleImportComplete}
            onCancel={() => setShowImportModal(false)}
          />
        )}
      </AdminModal>
    </div>
  );
}
