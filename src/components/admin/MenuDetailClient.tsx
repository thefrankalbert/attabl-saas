'use client';

import { useState, useCallback, useRef } from 'react';
import { useSessionState } from '@/hooks/useSessionState';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  Plus,
  ArrowLeft,
  Folder,
  Utensils,
  Edit2,
  Trash2,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Settings2,
  Eye,
  EyeOff,
  ChevronDown,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import AdminModal from '@/components/admin/AdminModal';
import ItemModifierEditor from '@/components/admin/ItemModifierEditor';
import ImageUpload from '@/components/shared/ImageUpload';
import { cn } from '@/lib/utils';
import { actionUpdateMenu } from '@/app/actions/menus';
import { actionToggleCategoryActive } from '@/app/actions/categories';
import type { Menu, Category, MenuItem } from '@/types/admin.types';

interface MenuDetailClientProps {
  tenantId: string;
  tenantSlug: string;
  menu: Menu;
  categories: Category[];
  items: MenuItem[];
}

export default function MenuDetailClient({
  tenantId,
  tenantSlug,
  menu: initialMenu,
  categories: initialCategories,
  items: initialItems,
}: MenuDetailClientProps) {
  const [menu, setMenu] = useState<Menu>(initialMenu);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [items, setItems] = useState<MenuItem[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useSessionState<Set<string>>(
    'menuDetail:expandedCategories',
    new Set(),
  );

  // Category modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catNameEn, setCatNameEn] = useState('');
  const [catOrder, setCatOrder] = useState(0);
  const [savingCategory, setSavingCategory] = useState(false);

  // Item edit modal state
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemFormName, setItemFormName] = useState('');
  const [itemFormDescription, setItemFormDescription] = useState('');
  const [itemFormPrice, setItemFormPrice] = useState(0);
  const [itemFormAvailable, setItemFormAvailable] = useState(true);
  const [itemFormImageUrl, setItemFormImageUrl] = useState('');
  const [savingItem, setSavingItem] = useState(false);

  // Inline price editing state
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');
  const priceInputRef = useRef<HTMLInputElement>(null);

  // Modifier editor state
  const [editingModifiersItem, setEditingModifiersItem] = useState<MenuItem | null>(null);

  const { toast } = useToast();
  const t = useTranslations('menus');
  const tc = useTranslations('common');
  const tCat = useTranslations('categories');
  const supabase = createClient();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: menuData } = await supabase
        .from('menus')
        .select('*, venue:venues(id, name, slug)')
        .eq('id', menu.id)
        .single();
      if (menuData) setMenu(menuData as Menu);

      const { data: catData } = await supabase
        .from('categories')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('menu_id', menu.id)
        .order('display_order', { ascending: true });
      if (catData) setCategories(catData as Category[]);

      const catIds = (catData || []).map((c: { id: string }) => c.id);
      if (catIds.length > 0) {
        const { data: itemsData } = await supabase
          .from('menu_items')
          .select('*, category:categories(id, name), modifiers:item_modifiers(*)')
          .eq('tenant_id', tenantId)
          .in('category_id', catIds)
          .order('created_at', { ascending: true });
        setItems((itemsData as MenuItem[]) || []);
      } else {
        setItems([]);
      }
    } catch {
      toast({ title: t('loadingError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [supabase, tenantId, menu.id, toast, t]);

  const toggleMenuActive = async () => {
    const prev = menu.is_active;
    setMenu((m) => ({ ...m, is_active: !m.is_active }));
    try {
      const result = await actionUpdateMenu(tenantId, {
        id: menu.id,
        is_active: !prev,
      });
      if (result.error) {
        setMenu((m) => ({ ...m, is_active: prev }));
        toast({ title: result.error, variant: 'destructive' });
      }
    } catch {
      setMenu((m) => ({ ...m, is_active: prev }));
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  // ─── Category CRUD ──────────────────────────────────────

  const openNewCategoryModal = () => {
    setEditingCategory(null);
    setCatName('');
    setCatNameEn('');
    setCatOrder(categories.length);
    setShowCategoryModal(true);
  };

  const openEditCategoryModal = (cat: Category) => {
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatNameEn(cat.name_en || '');
    setCatOrder(cat.display_order || 0);
    setShowCategoryModal(true);
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setSavingCategory(true);
    try {
      const payload = {
        name: catName.trim(),
        name_en: catNameEn.trim() || null,
        display_order: catOrder,
        tenant_id: tenantId,
        menu_id: menu.id,
      };
      if (editingCategory) {
        const { error } = await supabase
          .from('categories')
          .update(payload)
          .eq('id', editingCategory.id);
        if (error) throw error;
        toast({ title: t('categoryUpdated') });
      } else {
        const { error } = await supabase.from('categories').insert([payload]);
        if (error) throw error;
        toast({ title: t('categoryCreated') });
      }
      setShowCategoryModal(false);
      loadData();
    } catch {
      toast({ title: t('saveError'), variant: 'destructive' });
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    const catItems = items.filter((it) => it.category_id === cat.id);
    if (catItems.length > 0) {
      toast({
        title: tCat('categoryHasDishes', { count: catItems.length }),
        variant: 'destructive',
      });
      return;
    }
    if (!confirm(tCat('deleteCategoryConfirm', { name: cat.name }))) return;
    try {
      const { error } = await supabase.from('categories').delete().eq('id', cat.id);
      if (error) throw error;
      toast({ title: t('categoryDeleted') });
      loadData();
    } catch {
      toast({ title: t('deleteError'), variant: 'destructive' });
    }
  };

  const toggleCategoryActive = async (cat: Category) => {
    const newValue = !(cat.is_active ?? true);
    // Optimistic update
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, is_active: newValue } : c)));
    const result = await actionToggleCategoryActive(tenantId, cat.id, newValue);
    if (result.error) {
      // Rollback
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, is_active: cat.is_active } : c)),
      );
      toast({ title: result.error, variant: 'destructive' });
    } else {
      toast({
        title: newValue ? t('categoryVisible') : t('categoryHidden'),
      });
    }
  };

  // ─── Item operations (optimistic) ───────────────────────

  const toggleItemAvailable = async (item: MenuItem) => {
    const newValue = !item.is_available;
    // Optimistic update
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_available: newValue } : i)));
    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_available: newValue })
        .eq('id', item.id);
      if (error) throw error;
    } catch {
      // Rollback
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_available: item.is_available } : i)),
      );
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  // ─── Inline price editing ──────────────────────────────

  const startEditingPrice = (item: MenuItem) => {
    setEditingPriceId(item.id);
    setEditingPriceValue(String(item.price));
    setTimeout(() => priceInputRef.current?.select(), 0);
  };

  const saveInlinePrice = async (item: MenuItem) => {
    const newPrice = parseInt(editingPriceValue, 10);
    setEditingPriceId(null);
    if (isNaN(newPrice) || newPrice < 0 || newPrice === item.price) return;

    // Optimistic update
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, price: newPrice } : i)));
    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ price: newPrice })
        .eq('id', item.id);
      if (error) throw error;
      toast({ title: t('itemSaved') });
    } catch {
      // Rollback
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, price: item.price } : i)));
      toast({ title: t('itemSaveError'), variant: 'destructive' });
    }
  };

  // ─── Item edit modal ───────────────────────────────────

  const openEditItemModal = (item: MenuItem) => {
    setEditingItem(item);
    setItemFormName(item.name);
    setItemFormDescription(item.description || '');
    setItemFormPrice(item.price);
    setItemFormAvailable(item.is_available);
    setItemFormImageUrl(item.image_url || '');
  };

  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !itemFormName.trim()) return;
    setSavingItem(true);
    try {
      const payload = {
        name: itemFormName.trim(),
        description: itemFormDescription.trim() || undefined,
        price: itemFormPrice,
        is_available: itemFormAvailable,
        image_url: itemFormImageUrl || null,
      };
      const { error } = await supabase.from('menu_items').update(payload).eq('id', editingItem.id);
      if (error) throw error;

      // Optimistic update
      setItems((prev) =>
        prev.map((i) =>
          i.id === editingItem.id
            ? {
                ...i,
                name: payload.name,
                description: payload.description,
                price: payload.price,
                is_available: payload.is_available,
                image_url: payload.image_url ?? undefined,
              }
            : i,
        ),
      );
      toast({ title: t('itemSaved') });
      setEditingItem(null);
    } catch {
      toast({ title: t('itemSaveError'), variant: 'destructive' });
    } finally {
      setSavingItem(false);
    }
  };

  const getItemsForCategory = (categoryId: string) =>
    items.filter((item) => item.category_id === categoryId);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Breadcrumb + toggle — compact, no redundancy */}
      <div className="shrink-0 flex items-center justify-between gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <Link
            href={`/sites/${tenantSlug}/admin/menus`}
            className="hover:text-app-text text-app-text-secondary transition-colors flex items-center gap-1 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('breadcrumbMenus')}
          </Link>
          <span className="text-app-text-secondary">/</span>
          <h1 className="text-app-text font-semibold truncate">{menu.name}</h1>
        </div>
        <button
          onClick={toggleMenuActive}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all shrink-0',
            menu.is_active
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
              : 'bg-app-bg text-app-text-secondary border-app-border',
          )}
        >
          {menu.is_active ? (
            <>
              <ToggleRight className="w-3 h-3 inline mr-1" />
              {t('active')}
            </>
          ) : (
            <>
              <ToggleLeft className="w-3 h-3 inline mr-1" />
              {t('inactive')}
            </>
          )}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {/* Categories section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-app-text flex items-center gap-2">
              <Folder className="w-4 h-4 text-app-text-muted" />
              {t('categoriesCount', { count: categories.length })}
            </h2>
            <Button onClick={openNewCategoryModal} size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> {t('newCategory')}
            </Button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-app-card rounded-xl border border-app-border animate-pulse"
                />
              ))}
            </div>
          ) : categories.length > 0 ? (
            <div className="space-y-4">
              {categories.map((cat) => {
                const catItems = getItemsForCategory(cat.id);
                const isCatActive = cat.is_active ?? true;
                return (
                  <div key={cat.id} className={cn('space-y-2', !isCatActive && 'opacity-50')}>
                    {/* Category header — click to expand/collapse */}
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
                        <span className="font-medium">
                          {t('dishCount', { count: catItems.length })}
                        </span>
                      </div>
                      <div
                        className="flex items-center gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleCategoryActive(cat)}
                          className="text-xs h-8"
                          title={isCatActive ? t('categoryVisible') : t('categoryHidden')}
                        >
                          {isCatActive ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                          )}
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
                          className="text-xs h-8 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Items in this category — collapsible */}
                    {catItems.length > 0 && expandedCategories.has(cat.id) && (
                      <div className="ml-6 space-y-1">
                        {catItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 p-3 bg-app-bg rounded-lg hover:bg-app-bg/80 transition-colors group/item"
                          >
                            {item.image_url ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="w-8 h-8 rounded object-cover shrink-0"
                              />
                            ) : (
                              <Utensils className="w-3.5 h-3.5 text-app-text-muted shrink-0" />
                            )}
                            <span className="flex-1 text-sm text-app-text font-medium truncate">
                              {item.name}
                            </span>

                            {/* Inline price editing */}
                            {editingPriceId === item.id ? (
                              <input
                                ref={priceInputRef}
                                type="number"
                                className="w-24 text-sm font-bold text-app-text tabular-nums bg-app-card border border-app-border rounded px-2 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={editingPriceValue}
                                onChange={(e) => setEditingPriceValue(e.target.value)}
                                onBlur={() => saveInlinePrice(item)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveInlinePrice(item);
                                  if (e.key === 'Escape') setEditingPriceId(null);
                                }}
                                min={0}
                              />
                            ) : (
                              <button
                                onClick={() => startEditingPrice(item)}
                                className="text-sm font-bold text-app-text tabular-nums hover:text-blue-500 hover:underline transition-colors cursor-pointer"
                                title={t('editItem')}
                              >
                                {t('priceFcfa', { count: item.price })}
                              </button>
                            )}

                            {(item.modifiers?.length ?? 0) > 0 && (
                              <span className="text-[10px] font-bold text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded-full">
                                {item.modifiers!.length} mod.
                              </span>
                            )}

                            {/* Action buttons */}
                            <button
                              onClick={() => openEditItemModal(item)}
                              className="p-1.5 rounded-md text-app-text-muted hover:text-app-text hover:bg-app-card transition-colors"
                              title={t('editItem')}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingModifiersItem(item);
                              }}
                              className="p-1.5 rounded-md text-app-text-muted hover:text-app-text hover:bg-app-card transition-colors"
                              title={t('manageModifiers')}
                            >
                              <Settings2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => toggleItemAvailable(item)}
                              className={cn(
                                'px-2 py-0.5 rounded-full text-xs font-semibold border transition-all',
                                item.is_available
                                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                  : 'bg-app-bg text-app-text-secondary border-app-border',
                              )}
                            >
                              {item.is_available ? (
                                <>
                                  <Check className="w-3 h-3 inline mr-0.5" />
                                  {t('stockLabel')}
                                </>
                              ) : (
                                <>
                                  <X className="w-3 h-3 inline mr-0.5" />
                                  {t('exhaustedLabel')}
                                </>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-app-card rounded-xl border border-app-border p-12 text-center">
              <div className="w-14 h-14 bg-app-bg rounded-xl flex items-center justify-center mx-auto mb-4">
                <Folder className="w-7 h-7 text-app-text-muted" />
              </div>
              <h3 className="text-base font-bold text-app-text">{t('noCategoriesInMenu')}</h3>
              <p className="text-sm text-app-text-secondary mt-2">{t('noCategoriesInMenuDesc')}</p>
              <Button onClick={openNewCategoryModal} className="mt-4">
                {t('createCategory')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Category Modal */}
      <AdminModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        title={editingCategory ? t('editCategoryTitle') : t('newCategoryTitle')}
      >
        <form onSubmit={handleCategorySubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="cat-name">{t('categoryNameFr')}</Label>
            <Input
              id="cat-name"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder={t('nameFrPlaceholder')}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-order">{t('categoryDisplayOrder')}</Label>
            <Input
              id="cat-order"
              type="number"
              value={catOrder}
              onChange={(e) => setCatOrder(Number(e.target.value))}
              min={0}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setShowCategoryModal(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={savingCategory}>
              {savingCategory && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingCategory ? t('update') : t('create')}
            </Button>
          </div>
        </form>
      </AdminModal>

      {/* Item Edit Modal */}
      <AdminModal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        title={t('editItemTitle')}
      >
        {editingItem && (
          <form onSubmit={handleItemSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="item-name">{t('itemName')}</Label>
              <Input
                id="item-name"
                value={itemFormName}
                onChange={(e) => setItemFormName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-desc">{t('itemDescription')}</Label>
              <Textarea
                id="item-desc"
                value={itemFormDescription}
                onChange={(e) => setItemFormDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-price">{t('itemPrice')}</Label>
              <Input
                id="item-price"
                type="number"
                value={itemFormPrice}
                onChange={(e) => setItemFormPrice(Number(e.target.value))}
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('itemPhoto')}</Label>
              <ImageUpload
                value={itemFormImageUrl}
                onChange={(url) => setItemFormImageUrl(url)}
                onRemove={() => setItemFormImageUrl('')}
                bucket="menu-items"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setItemFormAvailable(!itemFormAvailable)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                  itemFormAvailable
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : 'bg-app-bg text-app-text-secondary border-app-border',
                )}
              >
                {itemFormAvailable ? (
                  <>
                    <Check className="w-3 h-3 inline mr-1" />
                    {t('itemInStock')}
                  </>
                ) : (
                  <>
                    <X className="w-3 h-3 inline mr-1" />
                    {t('exhaustedLabel')}
                  </>
                )}
              </button>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setEditingItem(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={savingItem}>
                {savingItem && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('update')}
              </Button>
            </div>
          </form>
        )}
      </AdminModal>

      {/* Modifier Editor Modal */}
      <AdminModal
        isOpen={!!editingModifiersItem}
        onClose={() => setEditingModifiersItem(null)}
        title={t('modifiersTitle')}
      >
        {editingModifiersItem && (
          <ItemModifierEditor
            tenantId={tenantId}
            menuItemId={editingModifiersItem.id}
            menuItemName={editingModifiersItem.name}
            modifiers={editingModifiersItem.modifiers || []}
            onUpdate={loadData}
            onClose={() => setEditingModifiersItem(null)}
          />
        )}
      </AdminModal>
    </div>
  );
}
