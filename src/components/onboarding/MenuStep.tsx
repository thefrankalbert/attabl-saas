'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Plus, X, UtensilsCrossed } from 'lucide-react';
import type { OnboardingData } from '@/app/onboarding/page';
import { compressImage, uploadToStorage } from '@/lib/image-compress';
import { createClient } from '@/lib/supabase/client';
import { getSegmentFamily } from '@/lib/segment-terms';
import { MenuItemRow } from './menu/MenuItemRow';
import { type Category, buildCategoriesFromData } from './menu/menu-data';

interface MenuStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}

export function MenuStep({ data, updateData }: MenuStepProps) {
  const t = useTranslations('onboarding');
  const tSeg = useTranslations('segment');
  const family = getSegmentFamily(data.establishmentType);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>(() =>
    buildCategoriesFromData(data.menuItems),
  );

  const syncToParent = useCallback(
    (cats: Category[]) => {
      const menuItems: OnboardingData['menuItems'] = [];
      for (const cat of cats) {
        for (const item of cat.items) {
          if (item.name.trim() || parseFloat(item.price) > 0) {
            menuItems.push({
              name: item.name,
              price: parseFloat(item.price) || 0,
              category: cat.name,
              imageUrl: item.imageUrl,
            });
          }
        }
      }
      updateData({
        menuItems,
        menuOption: menuItems.length > 0 ? 'manual' : 'skip',
      });
    },
    [updateData],
  );

  const addCategory = () => {
    if (categories.length >= 5) return;
    const updated = [
      ...categories,
      {
        id: crypto.randomUUID(),
        name: '',
        expanded: true,
        items: [{ id: crypto.randomUUID(), name: '', price: '' }],
      },
    ];
    setCategories(updated);
    syncToParent(updated);
  };

  const deleteCategory = (categoryId: string) => {
    const updated = categories.filter((c) => c.id !== categoryId);
    setCategories(updated);
    syncToParent(updated);
  };

  const toggleCategory = (categoryId: string) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, expanded: !c.expanded } : c)),
    );
  };

  const updateCategoryName = (categoryId: string, name: string) => {
    const updated = categories.map((c) => (c.id === categoryId ? { ...c, name } : c));
    setCategories(updated);
    syncToParent(updated);
  };

  const addArticle = (categoryId: string) => {
    const updated = categories.map((c) => {
      if (c.id !== categoryId) return c;
      if (c.items.length >= 10) return c;
      return {
        ...c,
        items: [...c.items, { id: crypto.randomUUID(), name: '', price: '' }],
      };
    });
    setCategories(updated);
    syncToParent(updated);
  };

  const deleteArticle = (categoryId: string, itemId: string) => {
    const updated = categories.map((c) => {
      if (c.id !== categoryId) return c;
      return {
        ...c,
        items: c.items.filter((item) => item.id !== itemId),
      };
    });
    setCategories(updated);
    syncToParent(updated);
  };

  const updateArticle = (
    categoryId: string,
    itemId: string,
    field: 'name' | 'price' | 'imageUrl',
    value: string,
  ) => {
    const updated = categories.map((c) => {
      if (c.id !== categoryId) return c;
      return {
        ...c,
        items: c.items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
      };
    });
    setCategories(updated);
    syncToParent(updated);
  };

  const handleItemPhotoUpload = async (categoryId: string, itemId: string, file: File) => {
    if (file.size > 15 * 1024 * 1024) return;
    setUploadingItemId(itemId);
    try {
      const compressed = await compressImage(file, {
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.8,
        type: 'image/jpeg',
      });
      const supabase = createClient();
      const publicUrl = await uploadToStorage(compressed, 'menu-items', supabase);
      updateArticle(categoryId, itemId, 'imageUrl', publicUrl);
    } catch {
      // Fallback to object URL if upload fails
      const url = URL.createObjectURL(file);
      updateArticle(categoryId, itemId, 'imageUrl', url);
    } finally {
      setUploadingItemId(null);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto" data-onboarding-scroll>
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          <div className="mx-auto w-full max-w-2xl">
            {/* Header */}
            <div className="mb-8">
              <h1 className="mb-1.5 text-xl font-semibold tracking-tight text-app-text">
                {t('menuTitle')}
              </h1>
              <p className="text-sm text-app-text-secondary">{t('menuSubtitle')}</p>
            </div>

            {/* Tip */}
            <div className="mb-6 rounded-xl border border-accent/20 bg-accent/5 p-4">
              <div className="flex items-start gap-2.5">
                <UtensilsCrossed className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <p className="text-xs text-app-text-secondary">{t('menuTip')}</p>
              </div>
            </div>

            {/* Categories - Full width */}
            <div>
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-app-text-muted">
                {tSeg(`${family}.catalog`)}
              </p>

              <div className="space-y-4">
                {categories.map((category) => {
                  const articleCount = category.items.length;

                  return (
                    <div
                      key={category.id}
                      className="overflow-hidden rounded-xl border border-app-border bg-app-elevated shadow-sm"
                    >
                      {/* Category Header */}
                      <div className="flex items-center gap-3 p-4">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleCategory(category.id)}
                          className="h-8 w-8 rounded-lg p-1.5 text-app-text-secondary transition-colors hover:bg-app-hover hover:text-app-text"
                          aria-label={category.expanded ? 'Collapse' : 'Expand'}
                        >
                          {category.expanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>

                        <Input
                          placeholder={t('categoryNamePlaceholder')}
                          value={category.name}
                          onChange={(e) => updateCategoryName(category.id, e.target.value)}
                          className="h-10 flex-1 rounded-lg border-app-border bg-app-bg px-3.5 text-sm font-semibold shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
                        />

                        <span className="whitespace-nowrap rounded-full border border-app-border bg-app-bg px-2.5 py-1 text-xs font-medium text-app-text-muted">
                          {t('articlesCount', { count: articleCount })}
                        </span>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteCategory(category.id)}
                          className="h-8 w-8 rounded-lg p-2 text-app-text-muted transition-colors hover:bg-status-error-bg hover:text-status-error"
                          aria-label={t('deleteCategory')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Category Body */}
                      {category.expanded && (
                        <div className="space-y-2.5 border-t border-app-border p-4">
                          {category.items.map((item) => (
                            <MenuItemRow
                              key={item.id}
                              categoryId={category.id}
                              item={item}
                              currency={data.currency}
                              uploadingItemId={uploadingItemId}
                              updateArticle={updateArticle}
                              deleteArticle={deleteArticle}
                              handleItemPhotoUpload={handleItemPhotoUpload}
                            />
                          ))}

                          {category.items.length < 10 ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => addArticle(category.id)}
                              className="flex h-auto w-full items-center gap-2 rounded-lg border border-dashed border-app-border bg-app-elevated px-4 py-2.5 text-sm font-medium text-app-text-secondary transition-colors hover:bg-app-hover hover:text-app-text"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              {t('addArticle')}
                            </Button>
                          ) : (
                            <p className="py-1 text-center text-xs text-app-text-muted">
                              {t('maxArticles')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add Category Button */}
                {categories.length < 5 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addCategory}
                    className="flex h-auto w-full items-center gap-2 rounded-xl border border-dashed border-app-border bg-app-elevated px-4 py-3 text-sm font-medium text-app-text-secondary shadow-sm transition-colors hover:bg-app-hover hover:text-app-text"
                  >
                    <Plus className="h-4 w-4" />
                    {t('addCategory')}
                  </Button>
                ) : (
                  <p className="text-center text-xs text-app-text-muted">{t('maxCategories')}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
