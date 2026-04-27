/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Camera, ChevronDown, ChevronRight, Plus, X, UtensilsCrossed, Loader2 } from 'lucide-react';
import type { OnboardingData } from '@/app/onboarding/page';
import { compressImage, uploadToStorage } from '@/lib/image-compress';
import { createClient } from '@/lib/supabase/client';
import { getSegmentFamily } from '@/lib/segment-terms';

interface MenuStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}

interface CategoryItem {
  id: string;
  name: string;
  price: string;
  imageUrl?: string;
}

interface Category {
  id: string;
  name: string;
  expanded: boolean;
  items: CategoryItem[];
}

function buildCategoriesFromData(menuItems: OnboardingData['menuItems']): Category[] {
  if (!menuItems || menuItems.length === 0) {
    return [
      {
        id: crypto.randomUUID(),
        name: '',
        expanded: true,
        items: [{ id: crypto.randomUUID(), name: '', price: '' }],
      },
    ];
  }

  const grouped = new Map<string, Array<{ name: string; price: number; imageUrl?: string }>>();
  for (const item of menuItems) {
    const cat = item.category || '';
    if (!grouped.has(cat)) {
      grouped.set(cat, []);
    }
    grouped.get(cat)!.push({ name: item.name, price: item.price, imageUrl: item.imageUrl });
  }

  const result: Category[] = [];
  for (const [catName, items] of grouped) {
    result.push({
      id: crypto.randomUUID(),
      name: catName,
      expanded: true,
      items: items.map((item) => ({
        id: crypto.randomUUID(),
        name: item.name,
        price: item.price > 0 ? String(item.price) : '',
        imageUrl: item.imageUrl,
      })),
    });
  }

  return result;
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
        <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-lg font-bold text-app-text mb-1">{t('menuTitle')}</h1>
            <p className="text-app-text-secondary text-sm">{t('menuSubtitle')}</p>
          </div>

          {/* Tip */}
          <div className="mb-6 p-4 rounded-xl bg-accent/5 border border-accent/20">
            <div className="flex items-start gap-2.5">
              <UtensilsCrossed className="h-4 w-4 text-accent mt-0.5 shrink-0" />
              <p className="text-xs text-app-text-secondary">{t('menuTip')}</p>
            </div>
          </div>

          {/* Categories - Full width */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-app-text-muted mb-4">
              {tSeg(`${family}.catalog`)}
            </p>

            <div className="space-y-4">
              {categories.map((category) => {
                const articleCount = category.items.length;

                return (
                  <div
                    key={category.id}
                    className="rounded-xl border border-app-border overflow-hidden"
                  >
                    {/* Category Header */}
                    <div className="flex items-center gap-3 p-4 bg-app-elevated/50">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleCategory(category.id)}
                        className="p-1.5 rounded-lg text-app-text-secondary hover:text-app-text hover:bg-app-hover transition-colors h-8 w-8"
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
                        className="flex-1 h-10 bg-app-bg border-app-border rounded-xl text-sm font-semibold"
                      />

                      <span className="text-xs text-app-text-muted whitespace-nowrap px-2.5 py-1 bg-app-bg border border-app-border rounded-full font-medium">
                        {t('articlesCount', { count: articleCount })}
                      </span>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteCategory(category.id)}
                        className="p-2 rounded-lg text-app-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors h-8 w-8"
                        aria-label={t('deleteCategory')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Category Body */}
                    {category.expanded && (
                      <div className="p-4 space-y-2.5">
                        {category.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2.5 p-2 rounded-xl bg-app-elevated/20 hover:bg-app-elevated/40 transition-colors"
                          >
                            {/* Photo upload */}
                            <div className="relative shrink-0">
                              {/* eslint-disable-next-line react/forbid-elements -- <input type="file"> is the CLAUDE.md-documented exception (no shadcn equivalent) */}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                id={`photo-${item.id}`}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  handleItemPhotoUpload(category.id, item.id, file);
                                  if (e.target) e.target.value = '';
                                }}
                              />
                              {uploadingItemId === item.id ? (
                                <div className="w-9 h-9 rounded-xl border border-app-border flex items-center justify-center">
                                  <Loader2 className="h-3.5 w-3.5 text-app-text-muted animate-spin" />
                                </div>
                              ) : item.imageUrl ? (
                                <div className="relative w-9 h-9">
                                  <img
                                    src={item.imageUrl}
                                    alt=""
                                    className="w-9 h-9 rounded-xl object-cover"
                                  />
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    aria-label="Remove image"
                                    onClick={() =>
                                      updateArticle(category.id, item.id, 'imageUrl', '')
                                    }
                                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full p-0 min-w-0 min-h-0"
                                  >
                                    <X className="h-2.5 w-2.5 text-white" />
                                  </Button>
                                </div>
                              ) : (
                                <Label
                                  htmlFor={`photo-${item.id}`}
                                  className="w-9 h-9 rounded-xl border border-dashed border-app-border flex items-center justify-center cursor-pointer hover:border-accent/40 transition-colors"
                                >
                                  <Camera className="h-3.5 w-3.5 text-app-text-muted" />
                                </Label>
                              )}
                            </div>
                            <Input
                              placeholder={t('articleNamePlaceholder')}
                              value={item.name}
                              onChange={(e) =>
                                updateArticle(category.id, item.id, 'name', e.target.value)
                              }
                              className="flex-1 h-9 bg-app-bg border-app-border rounded-xl text-sm"
                            />
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder={t('articlePrice')}
                                value={item.price}
                                onChange={(e) =>
                                  updateArticle(category.id, item.id, 'price', e.target.value)
                                }
                                className="w-24 h-9 bg-app-bg border-app-border rounded-xl text-sm"
                              />
                              <span className="text-xs text-app-text-muted font-medium">
                                {data.currency || 'EUR'}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteArticle(category.id, item.id)}
                              className="p-1.5 rounded-lg text-app-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0 h-7 w-7"
                              aria-label={t('deleteArticle')}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}

                        {category.items.length < 10 ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => addArticle(category.id)}
                            className="flex items-center gap-2 px-4 py-2.5 w-full rounded-xl border border-dashed border-app-border text-app-text-secondary hover:border-accent/40 hover:text-app-text transition-colors text-sm font-medium h-auto"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {t('addArticle')}
                          </Button>
                        ) : (
                          <p className="text-xs text-app-text-muted text-center py-1">
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
                  className="flex items-center gap-2 px-4 py-3 w-full rounded-xl border border-dashed border-app-border text-app-text-secondary hover:border-accent/40 hover:text-app-text transition-colors text-sm font-medium h-auto"
                >
                  <Plus className="h-4 w-4" />
                  {t('addCategory')}
                </Button>
              ) : (
                <p className="text-xs text-app-text-muted text-center">{t('maxCategories')}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
