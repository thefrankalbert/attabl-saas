/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Camera, ChevronDown, ChevronRight, Plus, X, UtensilsCrossed } from 'lucide-react';
import type { OnboardingData } from '@/app/onboarding/page';

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

  return (
    <div>
      {/* Title / Subtitle */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 mb-1">{t('menuTitle')}</h1>
        <p className="text-neutral-500 text-sm">{t('menuSubtitle')}</p>
      </div>

      {/* Live Menu Preview */}
      <div className="border border-neutral-200 rounded-xl p-3 bg-neutral-50 mb-4">
        <p className="text-[10px] text-neutral-400 mb-1.5 font-medium uppercase tracking-wide">
          {t('previewLabel')}
        </p>
        <div
          className="p-2 rounded-lg"
          style={{ backgroundColor: data.secondaryColor || '#000000' }}
        >
          {categories.slice(0, 2).map((cat) => (
            <div key={cat.id} className="mb-2 last:mb-0">
              {cat.name && (
                <p
                  className="text-[10px] font-bold mb-1"
                  style={{ color: data.primaryColor || '#CCFF00' }}
                >
                  {cat.name}
                </p>
              )}
              {cat.items
                .slice(0, 3)
                .filter((i) => i.name)
                .map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 mb-0.5">
                    <div className="flex items-center gap-1.5">
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="w-4 h-4 rounded-sm object-cover"
                        />
                      )}
                      <span
                        className="text-[10px]"
                        style={{ color: data.primaryColor || '#CCFF00' }}
                      >
                        {item.name}
                      </span>
                    </div>
                    {parseFloat(item.price) > 0 && (
                      <span
                        className="text-[10px] font-medium"
                        style={{ color: data.primaryColor || '#CCFF00' }}
                      >
                        {item.price} {data.currency || 'EUR'}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-3">
        {categories.map((category) => {
          const articleCount = category.items.length;

          return (
            <div key={category.id} className="border border-neutral-200 rounded-xl overflow-hidden">
              {/* Category Header */}
              <div className="flex items-center gap-2 p-3 bg-neutral-50">
                <button
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  className="p-1 rounded-md text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                  aria-label={category.expanded ? 'Collapse' : 'Expand'}
                >
                  {category.expanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                <Input
                  type="text"
                  placeholder={t('categoryNamePlaceholder')}
                  value={category.name}
                  onChange={(e) => updateCategoryName(category.id, e.target.value)}
                  className="flex-1 h-9 bg-white border-neutral-200 rounded-lg text-sm font-medium"
                />

                <span className="text-xs text-neutral-500 whitespace-nowrap px-2 py-1 bg-white border border-neutral-200 rounded-full">
                  {t('articlesCount', { count: articleCount })}
                </span>

                <button
                  type="button"
                  onClick={() => deleteCategory(category.id)}
                  className="p-1.5 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  aria-label={t('deleteCategory')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Category Body (expanded) */}
              {category.expanded && (
                <div className="p-3 space-y-2">
                  {category.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      {/* Photo upload */}
                      <div className="relative shrink-0">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id={`photo-${item.id}`}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file || file.size > 1024 * 1024) return;
                            const url = URL.createObjectURL(file);
                            updateArticle(category.id, item.id, 'imageUrl', url);
                          }}
                        />
                        {item.imageUrl ? (
                          <div className="relative w-8 h-8">
                            <img
                              src={item.imageUrl}
                              alt=""
                              className="w-8 h-8 rounded-md object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => updateArticle(category.id, item.id, 'imageUrl', '')}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center"
                            >
                              <X className="h-2.5 w-2.5 text-white" />
                            </button>
                          </div>
                        ) : (
                          <label
                            htmlFor={`photo-${item.id}`}
                            className="w-8 h-8 rounded-md border border-dashed border-neutral-300 flex items-center justify-center cursor-pointer hover:border-neutral-400"
                          >
                            <Camera className="h-3.5 w-3.5 text-neutral-400" />
                          </label>
                        )}
                      </div>
                      <Input
                        type="text"
                        placeholder={t('articleNamePlaceholder')}
                        value={item.name}
                        onChange={(e) =>
                          updateArticle(category.id, item.id, 'name', e.target.value)
                        }
                        className="flex-1 h-9 bg-neutral-50 border-neutral-200 rounded-lg text-sm"
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
                          className="w-28 h-9 bg-neutral-50 border-neutral-200 rounded-lg text-sm"
                        />
                        <span className="text-xs text-neutral-400">{data.currency || 'EUR'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteArticle(category.id, item.id)}
                        className="p-1.5 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        aria-label={t('deleteArticle')}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  {category.items.length < 10 ? (
                    <button
                      type="button"
                      onClick={() => addArticle(category.id)}
                      className="flex items-center gap-2 px-3 py-2 w-full rounded-lg border border-dashed border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 transition-colors text-sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t('addArticle')}
                    </button>
                  ) : (
                    <p className="text-xs text-neutral-400 text-center py-1">{t('maxArticles')}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Category Button */}
      {categories.length < 5 ? (
        <button
          type="button"
          onClick={addCategory}
          className="mt-3 flex items-center gap-2 px-3 py-2.5 w-full rounded-xl border-2 border-dashed border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 transition-colors text-sm"
        >
          <Plus className="h-4 w-4" />
          {t('addCategory')}
        </button>
      ) : (
        <p className="mt-3 text-xs text-neutral-400 text-center">{t('maxCategories')}</p>
      )}

      {/* Tip Card */}
      <div className="mt-4 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
        <div className="flex items-start gap-2">
          <UtensilsCrossed className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
          <p className="text-xs text-neutral-600">{t('menuTip')}</p>
        </div>
      </div>
    </div>
  );
}
