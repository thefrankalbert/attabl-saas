'use client';

import { useState, useCallback } from 'react';
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
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import AdminModal from '@/components/admin/AdminModal';
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

  const { toast } = useToast();
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
          .select('*, category:categories(id, name)')
          .eq('tenant_id', tenantId)
          .in('category_id', catIds)
          .order('display_order', { ascending: true });
        setItems((itemsData as MenuItem[]) || []);
      } else {
        setItems([]);
      }
    } catch {
      toast({ title: 'Erreur lors du chargement', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [supabase, tenantId, menu.id, toast]);

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
      toast({ title: 'Erreur', variant: 'destructive' });
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
        toast({ title: 'Cat\u00e9gorie mise \u00e0 jour' });
      } else {
        const { error } = await supabase.from('categories').insert([payload]);
        if (error) throw error;
        toast({ title: 'Cat\u00e9gorie cr\u00e9\u00e9e' });
      }
      setShowCategoryModal(false);
      loadData();
    } catch {
      toast({ title: 'Erreur lors de la sauvegarde', variant: 'destructive' });
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    const catItems = items.filter((it) => it.category_id === cat.id);
    if (catItems.length > 0) {
      toast({
        title: `Cette cat\u00e9gorie contient ${catItems.length} plat(s). Supprimez-les d\u2019abord.`,
        variant: 'destructive',
      });
      return;
    }
    if (!confirm(`Supprimer la cat\u00e9gorie "${cat.name}" ?`)) return;
    try {
      const { error } = await supabase.from('categories').delete().eq('id', cat.id);
      if (error) throw error;
      toast({ title: 'Cat\u00e9gorie supprim\u00e9e' });
      loadData();
    } catch {
      toast({ title: 'Erreur lors de la suppression', variant: 'destructive' });
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
      toast({ title: 'Erreur', variant: 'destructive' });
    }
  };

  const getItemsForCategory = (categoryId: string) =>
    items.filter((item) => item.category_id === categoryId);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link
          href={`/sites/${tenantSlug}/admin/menus`}
          className="hover:text-gray-900 transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Cartes
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{menu.name}</span>
      </div>

      {/* Menu info header */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">{menu.name}</h1>
            {menu.name_en && <p className="text-sm text-gray-400">{menu.name_en}</p>}
            {menu.description && <p className="text-sm text-gray-500 mt-2">{menu.description}</p>}
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
                  : 'bg-gray-100 text-gray-500 border-gray-200',
              )}
            >
              {menu.is_active ? (
                <>
                  <ToggleRight className="w-3 h-3 inline mr-1" />
                  Active
                </>
              ) : (
                <>
                  <ToggleLeft className="w-3 h-3 inline mr-1" />
                  Inactive
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Categories section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Folder className="w-4 h-4 text-gray-400" />
            Cat\u00e9gories ({categories.length})
          </h2>
          <Button onClick={openNewCategoryModal} size="sm" className="gap-2">
            <Plus className="w-4 h-4" /> Nouvelle cat\u00e9gorie
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-16 bg-white rounded-xl border border-gray-100 animate-pulse"
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
                  <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:bg-gray-50/50 transition-colors group">
                    <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Folder className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{cat.name}</p>
                      {cat.name_en && <p className="text-xs text-gray-400">{cat.name_en}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Utensils className="w-3.5 h-3.5" />
                      <span className="font-medium">
                        {catItems.length} plat{catItems.length > 1 ? 's' : ''}
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
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100/80 transition-colors"
                        >
                          <Utensils className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="flex-1 text-sm text-gray-700 font-medium truncate">
                            {item.name}
                          </span>
                          <span className="text-sm font-bold text-gray-900 tabular-nums">
                            {item.price.toLocaleString()} FCFA
                          </span>
                          <button
                            onClick={() => toggleItemAvailable(item)}
                            className={cn(
                              'px-2 py-0.5 rounded-full text-xs font-semibold border transition-all',
                              item.is_available
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : 'bg-gray-100 text-gray-500 border-gray-200',
                            )}
                          >
                            {item.is_available ? (
                              <>
                                <Check className="w-3 h-3 inline mr-0.5" />
                                Stock
                              </>
                            ) : (
                              <>
                                <X className="w-3 h-3 inline mr-0.5" />
                                \u00c9puis\u00e9
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
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Folder className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Aucune cat\u00e9gorie</h3>
            <p className="text-sm text-gray-500 mt-2">
              Ajoutez des cat\u00e9gories pour organiser les plats de cette carte
            </p>
            <Button onClick={openNewCategoryModal} className="mt-4">
              Cr\u00e9er une cat\u00e9gorie
            </Button>
          </div>
        )}
      </div>

      {/* Category Modal */}
      <AdminModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        title={editingCategory ? 'Modifier la cat\u00e9gorie' : 'Nouvelle cat\u00e9gorie'}
      >
        <form onSubmit={handleCategorySubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Nom (FR) *</Label>
              <Input
                id="cat-name"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Ex: Entr\u00e9es"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-name-en">Nom (EN)</Label>
              <Input
                id="cat-name-en"
                value={catNameEn}
                onChange={(e) => setCatNameEn(e.target.value)}
                placeholder="Ex: Starters"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-order">Ordre d&apos;affichage</Label>
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
              Annuler
            </Button>
            <Button type="submit" disabled={savingCategory}>
              {savingCategory && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingCategory ? 'Mettre \u00e0 jour' : 'Cr\u00e9er'}
            </Button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
