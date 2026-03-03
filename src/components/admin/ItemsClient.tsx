'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Loader2, Star, Check, X, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useMenuItems } from '@/hooks/queries';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AdminModal from '@/components/admin/AdminModal';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/currency';
import { checkCanAddMenuItemAction } from '@/app/actions/menu-items';
import RoleGuard from '@/components/admin/RoleGuard';
import ImageUpload from '@/components/shared/ImageUpload';
import { ALLERGENS } from '@/lib/config/allergens';
import type { MenuItem, Category, CurrencyCode } from '@/types/admin.types';

interface ItemsClientProps {
  tenantId: string;
  initialItems: MenuItem[];
  initialCategories: Category[];
  currency?: CurrencyCode;
}

export default function ItemsClient({
  tenantId,
  initialItems,
  initialCategories,
  currency = 'XAF',
}: ItemsClientProps) {
  const [categories] = useState<Category[]>(initialCategories);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterAvailable, setFilterAvailable] = useState('all');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [price, setPrice] = useState(0);
  const [categoryId, setCategoryId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [calories, setCalories] = useState<number | ''>('');

  const { toast } = useToast();
  const t = useTranslations('items');
  const tc = useTranslations('common');
  const ta = useTranslations('allergens');
  const supabase = createClient();
  const queryClient = useQueryClient();

  const closePanel = useCallback(() => setSelectedItem(null), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closePanel]);

  // TanStack Query for menu items with category join
  const { data: items = initialItems, isLoading: loading } = useMenuItems(tenantId, {
    categoryId: filterCategory,
    availableFilter: filterAvailable,
    withCategory: true,
  });

  const loadItems = () => {
    queryClient.invalidateQueries({ queryKey: ['menu-items', tenantId] });
  };

  const resetForm = () => {
    setName('');
    setNameEn('');
    setDescription('');
    setDescriptionEn('');
    setPrice(0);
    setCategoryId('');
    setImageUrl('');
    setIsAvailable(true);
    setIsFeatured(false);
    setAllergens([]);
    setCalories('');
  };

  const openNewModal = () => {
    setEditingItem(null);
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setName(item.name);
    setNameEn(item.name_en || '');
    setDescription(item.description || '');
    setDescriptionEn(item.description_en || '');
    setPrice(item.price);
    setCategoryId(item.category_id);
    setImageUrl(item.image_url || '');
    setIsAvailable(item.is_available);
    setIsFeatured(item.is_featured);
    setAllergens(item.allergens || []);
    setCalories(item.calories ?? '');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !categoryId) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        name_en: nameEn.trim() || null,
        description: description.trim() || null,
        description_en: descriptionEn.trim() || null,
        price,
        category_id: categoryId,
        image_url: imageUrl.trim() || null,
        is_available: isAvailable,
        is_featured: isFeatured,
        allergens,
        calories: calories === '' ? null : Number(calories),
        tenant_id: tenantId,
      };
      if (editingItem) {
        const { error } = await supabase
          .from('menu_items')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
        toast({ title: t('itemUpdated') });
      } else {
        // Vérifier les limites du plan avant la création
        const limitCheck = await checkCanAddMenuItemAction(tenantId);
        if (limitCheck.error) {
          toast({ title: limitCheck.error, variant: 'destructive' });
          return;
        }
        const { error } = await supabase.from('menu_items').insert([payload]);
        if (error) throw error;
        toast({ title: t('itemCreated') });
      }
      setShowModal(false);
      loadItems();
    } catch {
      toast({ title: t('saveError'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: MenuItem) => {
    if (!confirm(t('deleteConfirm', { name: item.name }))) return;
    try {
      const { error } = await supabase.from('menu_items').delete().eq('id', item.id);
      if (error) throw error;
      toast({ title: t('itemDeleted') });
      loadItems();
    } catch {
      toast({ title: t('deleteError'), variant: 'destructive' });
    }
  };

  const toggleAvailable = async (item: MenuItem) => {
    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_available: !item.is_available })
        .eq('id', item.id);
      if (error) throw error;
      loadItems();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const toggleFeatured = async (item: MenuItem) => {
    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_featured: !item.is_featured })
        .eq('id', item.id);
      if (error) throw error;
      toast({ title: item.is_featured ? t('removedFromFeatured') : t('addedToFeatured') });
      loadItems();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  return (
    <RoleGuard permission="canManageMenus">
      <div className="h-full flex flex-col overflow-hidden">
        <div className="shrink-0 space-y-3">
          {/* Header — single line on desktop */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <h1 className="text-2xl font-bold text-app-text tracking-tight shrink-0">
              {t('title')}
              <span className="text-base font-normal text-app-text-secondary ml-2">
                ({items.length})
              </span>
            </h1>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-9 w-full sm:w-[180px] text-xs rounded-lg border border-app-border text-app-text focus:ring-accent">
                  <SelectValue placeholder={t('allCategories')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allCategories')}</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterAvailable} onValueChange={setFilterAvailable}>
                <SelectTrigger className="h-9 w-full sm:w-[140px] text-xs rounded-lg border border-app-border text-app-text focus:ring-accent">
                  <SelectValue placeholder={t('all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all')}</SelectItem>
                  <SelectItem value="available">{t('inStock')}</SelectItem>
                  <SelectItem value="unavailable">{t('outOfStock')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={openNewModal}
              variant="default"
              size="sm"
              className="gap-2 lg:ml-auto shrink-0"
            >
              <Plus className="w-4 h-4" /> {t('newItem')}
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6">
          {/* Items List */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-20 bg-app-card rounded-xl border border-app-border animate-pulse"
                />
              ))}
            </div>
          ) : items.length > 0 ? (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="flex flex-wrap md:flex-nowrap items-center gap-3 md:gap-4 p-4 bg-app-card rounded-xl border border-app-border hover:bg-app-bg transition-colors group cursor-pointer"
                >
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-lg object-cover border border-app-border"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-app-bg flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-app-text-muted" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-app-text text-sm truncate">{item.name}</p>
                    <p className="text-xs text-app-text-muted mt-0.5">
                      {item.category?.name || t('uncategorized')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-app-text text-sm tabular-nums">
                      {formatCurrency(item.price, currency)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAvailable(item);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-semibold border transition-all',
                      item.is_available
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : 'bg-app-bg text-app-text-secondary border-app-border',
                    )}
                  >
                    {item.is_available ? (
                      <>
                        <Check className="w-3 h-3 inline mr-1" />
                        {t('stock')}
                      </>
                    ) : (
                      <>
                        <X className="w-3 h-3 inline mr-1" />
                        {t('exhausted')}
                      </>
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFeatured(item);
                    }}
                    className={cn(
                      'p-2.5 rounded-lg transition-all min-h-[44px] min-w-[44px] flex items-center justify-center',
                      item.is_featured
                        ? 'text-amber-500 bg-amber-500/10'
                        : 'text-app-text-muted hover:text-amber-500 hover:bg-app-bg',
                    )}
                  >
                    <Star className={cn('w-4 h-4', item.is_featured && 'fill-current')} />
                  </button>
                  <div className="flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(item);
                      }}
                      className="text-xs h-10 min-h-[44px]"
                    >
                      {t('edit')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item);
                      }}
                      className="text-xs h-10 min-h-[44px] text-red-600 hover:text-red-700 hover:bg-red-500/10"
                    >
                      {t('delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-app-card rounded-xl border border-app-border p-16 text-center">
              <div className="w-16 h-16 bg-app-bg rounded-xl flex items-center justify-center mx-auto mb-4">
                <ImageIcon className="w-8 h-8 text-app-text-muted" />
              </div>
              <h3 className="text-lg font-bold text-app-text">{t('noItems')}</h3>
              <p className="text-sm text-app-text-secondary mt-2">{t('noItemsDesc')}</p>
              <Button onClick={openNewModal} variant="default" className="mt-6">
                {t('addItem')}
              </Button>
            </div>
          )}
        </div>

        {/* Detail Side Panel */}
        {selectedItem && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40 bg-black/20" onClick={closePanel} />
            {/* Panel */}
            <div
              className={cn(
                'fixed right-0 top-0 h-full w-full sm:w-[400px] z-50 bg-app-card border-l border-app-border rounded-l-xl overflow-y-auto',
                'transition-transform duration-300 ease-out translate-x-0',
              )}
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between p-5 border-b border-app-border">
                <h2 className="text-base font-bold text-app-text">{t('details')}</h2>
                <button
                  onClick={closePanel}
                  className="p-2.5 rounded-lg hover:bg-app-bg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-app-text-secondary" />
                </button>
              </div>

              {/* Panel Content */}
              <div className="p-5 space-y-5">
                {/* Image */}
                {selectedItem.image_url ? (
                  <div className="relative w-full h-48">
                    <Image
                      src={selectedItem.image_url}
                      alt={selectedItem.name}
                      fill
                      sizes="(max-width: 640px) 100vw, 400px"
                      className="rounded-xl object-cover border border-app-border"
                    />
                  </div>
                ) : (
                  <div className="w-full h-48 rounded-xl bg-app-bg border border-app-border flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-app-text-muted" />
                  </div>
                )}

                {/* Name */}
                <div className="space-y-1">
                  <p className="text-xs text-app-text-muted font-medium">{t('nameFr')}</p>
                  <p className="text-sm font-semibold text-app-text">{selectedItem.name}</p>
                </div>

                {/* Name EN */}
                <div className="space-y-1">
                  <p className="text-xs text-app-text-muted font-medium">{t('nameEn')}</p>
                  <p className="text-sm text-app-text">{selectedItem.name_en || '—'}</p>
                </div>

                {/* Description FR */}
                <div className="space-y-1">
                  <p className="text-xs text-app-text-muted font-medium">{t('descriptionFr')}</p>
                  <p className="text-sm text-app-text">
                    {selectedItem.description || t('noDescription')}
                  </p>
                </div>

                {/* Description EN */}
                <div className="space-y-1">
                  <p className="text-xs text-app-text-muted font-medium">{t('descriptionEn')}</p>
                  <p className="text-sm text-app-text">{selectedItem.description_en || '—'}</p>
                </div>

                {/* Price */}
                <div className="space-y-1">
                  <p className="text-xs text-app-text-muted font-medium">{t('price')}</p>
                  <p className="text-lg font-bold text-app-text tabular-nums">
                    {formatCurrency(selectedItem.price, currency)}
                  </p>
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <p className="text-xs text-app-text-muted font-medium">{t('category')}</p>
                  <p className="text-sm text-app-text">
                    {selectedItem.category?.name || t('uncategorized')}
                  </p>
                </div>

                {/* Allergens */}
                {selectedItem.allergens && selectedItem.allergens.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-app-text-muted font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {ta('title')}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {selectedItem.allergens.map((a) => (
                        <span
                          key={a}
                          className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/10 text-orange-500 border border-orange-500/20"
                        >
                          {ta(a)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Calories */}
                {selectedItem.calories != null && (
                  <div className="space-y-1">
                    <p className="text-xs text-app-text-muted font-medium">{ta('calories')}</p>
                    <p className="text-sm text-app-text">{selectedItem.calories} kcal</p>
                  </div>
                )}

                {/* Availability & Featured badges */}
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-semibold border',
                      selectedItem.is_available
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : 'bg-app-bg text-app-text-secondary border-app-border',
                    )}
                  >
                    {selectedItem.is_available ? (
                      <>
                        <Check className="w-3 h-3 inline mr-1" />
                        {t('stock')}
                      </>
                    ) : (
                      <>
                        <X className="w-3 h-3 inline mr-1" />
                        {t('exhausted')}
                      </>
                    )}
                  </span>
                  {selectedItem.is_featured && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 inline-flex items-center gap-1">
                      <Star className="w-3 h-3 fill-current" />
                      {t('featured')}
                    </span>
                  )}
                </div>

                {/* Edit Button */}
                <Button
                  variant="default"
                  className="w-full mt-2"
                  onClick={() => {
                    openEditModal(selectedItem);
                    closePanel();
                  }}
                >
                  {t('edit')}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Modal */}
        <AdminModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={editingItem ? t('editItemTitle') : t('newItemTitle')}
          size="lg"
        >
          <form onSubmit={handleSubmit} className="space-y-5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-app-text">{t('nameFr')}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('nameFrPlaceholder')}
                  className="rounded-lg border border-app-border text-app-text focus-visible:ring-accent"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-app-text">{t('nameEn')}</Label>
                <Input
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder={t('nameEnPlaceholder')}
                  className="rounded-lg border border-app-border text-app-text focus-visible:ring-accent"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-app-text">{t('descriptionFr')}</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('descriptionFrPlaceholder')}
                  rows={3}
                  className="rounded-lg border border-app-border text-app-text focus-visible:ring-accent"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-app-text">{t('descriptionEn')}</Label>
                <Textarea
                  value={descriptionEn}
                  onChange={(e) => setDescriptionEn(e.target.value)}
                  placeholder={t('descriptionEnPlaceholder')}
                  rows={3}
                  className="rounded-lg border border-app-border text-app-text focus-visible:ring-accent"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-app-text">{t('price')}</Label>
                <Input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  min={0}
                  className="rounded-lg border border-app-border text-app-text focus-visible:ring-accent"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-app-text">{t('category')}</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="rounded-lg border border-app-border text-app-text focus:ring-accent">
                    <SelectValue placeholder={t('selectCategory')} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-app-text">{t('imageUrl')}</Label>
              <ImageUpload
                value={imageUrl}
                onChange={(url) => setImageUrl(url)}
                onRemove={() => setImageUrl('')}
                bucket="menu-items"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-app-text flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                {ta('title')}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {ALLERGENS.map((a) => {
                  const selected = allergens.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() =>
                        setAllergens((prev) =>
                          selected ? prev.filter((x) => x !== a) : [...prev, a],
                        )
                      }
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                        selected
                          ? 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                          : 'bg-app-bg text-app-text-secondary border-app-border hover:border-app-border-hover',
                      )}
                    >
                      {ta(a)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-app-text">{ta('calories')}</Label>
              <Input
                type="number"
                value={calories}
                onChange={(e) => setCalories(e.target.value === '' ? '' : Number(e.target.value))}
                min={0}
                placeholder={ta('caloriesPlaceholder')}
                className="rounded-lg border border-app-border text-app-text focus-visible:ring-accent w-full sm:w-[200px]"
              />
            </div>
            <div className="flex items-center gap-6 pt-2">
              <div className="flex items-center gap-2">
                <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
                <Label className="text-sm text-app-text">{t('available')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
                <Label className="text-sm text-app-text">{t('featured')}</Label>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
              <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={saving} variant="default">
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingItem ? t('update') : t('create')}
              </Button>
            </div>
          </form>
        </AdminModal>
      </div>
    </RoleGuard>
  );
}
