'use client';

import { useState, useCallback } from 'react';
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
  Building2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Settings2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import AdminModal from '@/components/admin/AdminModal';
import ItemModifierEditor from '@/components/admin/ItemModifierEditor';
import { cn } from '@/lib/utils';
import { actionUpdateMenu } from '@/app/actions/menus';
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

  // Category modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catNameEn, setCatNameEn] = useState('');
  const [catOrder, setCatOrder] = useState(0);
  const [savingCategory, setSavingCategory] = useState(false);

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
          .order('display_order', { ascending: true });
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
    try {
      const result = await actionUpdateMenu(tenantId, {
        id: menu.id,
        is_active: !menu.is_active,
      });
      if (result.error) {
        toast({ title: result.error, variant: 'destructive' });
        return;
      }
      setMenu((prev) => ({ ...prev, is_active: !prev.is_active }));
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  // Category CRUD
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

  const toggleItemAvailable = async (item: MenuItem) => {
    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_available: !item.is_available })
        .eq('id', item.id);
      if (error) throw error;
      loadData();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const getItemsForCategory = (categoryId: string) =>
    items.filter((item) => item.category_id === categoryId);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-app-text-secondary">
        <Link
          href={`/sites/${tenantSlug}/admin/menus`}
          className="hover:text-app-text transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('breadcrumbMenus')}
        </Link>
        <span>/</span>
        <span className="text-app-text font-medium">{menu.name}</span>
      </div>

      {/* Menu info header */}
      <div className="bg-app-card rounded-xl border border-app-border p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-app-text tracking-tight">{menu.name}</h1>
            {menu.name_en && <p className="text-sm text-app-text-muted">{menu.name_en}</p>}
            {menu.description && (
              <p className="text-sm text-app-text-secondary mt-2">{menu.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {menu.venue && (
              <Badge variant="outline" className="gap-1">
                <Building2 className="w-3 h-3" />
                {menu.venue.name}
              </Badge>
            )}
            <button
              onClick={toggleMenuActive}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                menu.is_active
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
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
        </div>
      </div>

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
              return (
                <div key={cat.id} className="space-y-2">
                  {/* Category header */}
                  <div className="flex items-center gap-4 p-4 bg-app-card rounded-xl border border-app-border hover:bg-app-bg transition-colors group">
                    <div className="w-9 h-9 bg-app-bg rounded-lg flex items-center justify-center">
                      <Folder className="w-4 h-4 text-app-text-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-app-text text-sm">{cat.name}</p>
                      {cat.name_en && <p className="text-xs text-app-text-muted">{cat.name_en}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-app-text-secondary">
                      <Utensils className="w-3.5 h-3.5" />
                      <span className="font-medium">
                        {t('dishCount', { count: catItems.length })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
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
                        className="text-xs h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Items in this category */}
                  {catItems.length > 0 && (
                    <div className="ml-6 space-y-1">
                      {catItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 p-3 bg-app-bg rounded-lg hover:bg-app-bg/80 transition-colors"
                        >
                          <Utensils className="w-3.5 h-3.5 text-app-text-muted shrink-0" />
                          <span className="flex-1 text-sm text-app-text font-medium truncate">
                            {item.name}
                          </span>
                          <span className="text-sm font-bold text-app-text tabular-nums">
                            {t('priceFcfa', { count: item.price })}
                          </span>
                          {(item.modifiers?.length ?? 0) > 0 && (
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                              {item.modifiers!.length} mod.
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingModifiersItem(item);
                            }}
                            className="p-1.5 rounded-md text-app-text-muted hover:text-app-text hover:bg-app-bg transition-colors"
                            title={t('manageModifiers')}
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => toggleItemAvailable(item)}
                            className={cn(
                              'px-2 py-0.5 rounded-full text-xs font-semibold border transition-all',
                              item.is_available
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
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

      {/* Category Modal */}
      <AdminModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        title={editingCategory ? t('editCategoryTitle') : t('newCategoryTitle')}
      >
        <form onSubmit={handleCategorySubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
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
              <Label htmlFor="cat-name-en">{t('categoryNameEn')}</Label>
              <Input
                id="cat-name-en"
                value={catNameEn}
                onChange={(e) => setCatNameEn(e.target.value)}
                placeholder={t('nameEnPlaceholder')}
              />
            </div>
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
