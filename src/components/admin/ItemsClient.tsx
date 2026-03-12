'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSessionState } from '@/hooks/useSessionState';
import { useTranslations } from 'next-intl';
import {
  Plus,
  Loader2,
  Star,
  Check,
  X,
  Image as ImageIcon,
  AlertTriangle,
  Edit2,
  Trash2,
  Package,
  MoreVertical,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useMenuItems } from '@/hooks/queries';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { actionCheckCanAddMenuItem } from '@/app/actions/menu-items';
import RoleGuard from '@/components/admin/RoleGuard';
import ImageUpload from '@/components/shared/ImageUpload';
import { ALLERGENS } from '@/lib/config/allergens';
import { logger } from '@/lib/logger';
import { revalidateMenuCache } from '@/lib/revalidate';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import type { MenuItem, Category, CurrencyCode } from '@/types/admin.types';

interface ItemsClientProps {
  tenantId: string;
  initialItems: MenuItem[];
  initialCategories: Category[];
  currency?: CurrencyCode;
  supportedCurrencies?: CurrencyCode[];
}

export default function ItemsClient({
  tenantId,
  initialItems,
  initialCategories,
  currency = 'XAF',
  supportedCurrencies = [],
}: ItemsClientProps) {
  // Secondary currencies = supported minus the base currency
  const secondaryCurrencies = supportedCurrencies.filter((c) => c !== currency);
  const [categories] = useState<Category[]>(initialCategories);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useSessionState('items:filterCategory', 'all');
  const [filterAvailable, setFilterAvailable] = useSessionState('items:filterAvailable', 'all');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Form state
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [price, setPrice] = useState<number | string>(0);
  const [categoryId, setCategoryId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [calories, setCalories] = useState<number | ''>('');
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [formStep, setFormStep] = useState<1 | 2 | 3>(1);

  const { toast } = useToast();
  const t = useTranslations('items');
  const tc = useTranslations('common');
  const ta = useTranslations('allergens');
  const seg = useSegmentTerms();
  const supabase = createClient();
  const router = useRouter();
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
    setPrices({});
    setFormStep(1);
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
    setPrices((item.prices as Record<string, number>) || {});
    setFormStep(1);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !categoryId) return;
    setSaving(true);
    try {
      const cleanPrices = Object.fromEntries(Object.entries(prices).filter(([, v]) => v > 0));
      const payload: Record<string, unknown> = {
        name: name.trim(),
        name_en: nameEn.trim() || null,
        description: description.trim() || null,
        description_en: descriptionEn.trim() || null,
        price: Number(price) || 0,
        category_id: categoryId,
        image_url: imageUrl.trim() || null,
        is_available: isAvailable,
        is_featured: isFeatured,
        allergens,
        calories: calories === '' ? null : Number(calories),
        tenant_id: tenantId,
      };

      // Only include the prices JSONB field when the tenant has secondary currencies.
      // The column may not exist on DBs where the multi-currency migration was not
      // applied — omitting it entirely avoids a PostgREST column-not-found error.
      if (secondaryCurrencies.length > 0) {
        payload.prices = Object.keys(cleanPrices).length > 0 ? cleanPrices : null;
      }

      if (editingItem) {
        const { error } = await supabase
          .from('menu_items')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
        toast({ title: t('itemUpdated') });
      } else {
        // Vérifier les limites du plan avant la création
        const limitCheck = await actionCheckCanAddMenuItem(tenantId);
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
      router.refresh();
      revalidateMenuCache();
    } catch (err) {
      logger.error('Failed to save menu item', err, {
        tenantId,
        editingItemId: editingItem?.id ?? null,
      });
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
      router.refresh();
      revalidateMenuCache();
    } catch {
      toast({ title: t('deleteError'), variant: 'destructive' });
    }
  };

  const toggleAvailable = async (item: MenuItem) => {
    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_available: !item.is_available })
        .eq('id', item.id)
        .eq('tenant_id', tenantId);
      if (error) throw error;
      loadItems();
      router.refresh();
      revalidateMenuCache();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const toggleFeatured = async (item: MenuItem) => {
    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_featured: !item.is_featured })
        .eq('id', item.id)
        .eq('tenant_id', tenantId);
      if (error) throw error;
      toast({ title: item.is_featured ? t('removedFromFeatured') : t('addedToFeatured') });
      loadItems();
      router.refresh();
      revalidateMenuCache();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  return (
    <RoleGuard permission="canManageMenus">
      <div className="h-full flex flex-col overflow-hidden">
        <div className="shrink-0">
          {/* Header — single row like inventory */}
          <div className="flex flex-col @lg:flex-row @lg:items-center gap-3">
            <h1 className="text-xl font-bold text-app-text flex items-center gap-2 shrink-0">
              {seg.items}
              <span className="text-sm font-normal text-app-text-muted">({items.length})</span>
            </h1>

            {/* Filters inline */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-9 w-full sm:w-44 text-xs rounded-lg border border-app-border text-app-text focus:ring-accent/30">
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
                <SelectTrigger className="h-9 w-full sm:w-36 text-xs rounded-lg border border-app-border text-app-text focus:ring-accent/30">
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
              className="gap-2 h-9 lg:ml-auto shrink-0"
            >
              <Plus className="w-4 h-4" /> {seg.addItem}
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6">
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 mb-2 rounded-xl bg-accent-muted border border-accent/20">
              <span className="text-sm font-medium text-app-text">{selectedIds.size} selected</span>
              <div className="flex-1" />
              <button
                onClick={async () => {
                  const targetAvailability = [...selectedIds].some((id) => {
                    const item = items.find((i) => i.id === id);
                    return item && !item.is_available;
                  });
                  const results = await Promise.all(
                    [...selectedIds].map((id) => {
                      const item = items.find((i) => i.id === id);
                      if (!item) return Promise.resolve(null);
                      return supabase
                        .from('menu_items')
                        .update({ is_available: targetAvailability })
                        .eq('id', item.id)
                        .eq('tenant_id', tenantId);
                    }),
                  );
                  const failed = results.filter((r) => r?.error);
                  if (failed.length > 0) {
                    toast({ title: tc('error'), variant: 'destructive' });
                  } else {
                    setSelectedIds(new Set());
                  }
                  loadItems();
                  router.refresh();
                  revalidateMenuCache();
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-app-card border border-app-border hover:bg-app-hover text-app-text transition-colors"
              >
                Toggle availability
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-app-card border border-app-border hover:bg-app-hover text-app-text-muted transition-colors"
              >
                Clear
              </button>
            </div>
          )}

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
            <div className="bg-app-card rounded-xl border border-app-border overflow-hidden">
              {/* Select all header */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-app-border bg-app-bg/30">
                <input
                  type="checkbox"
                  checked={items.length > 0 && items.every((i) => selectedIds.has(i.id))}
                  onChange={(e) => {
                    const next = new Set(selectedIds);
                    if (e.target.checked) {
                      items.forEach((i) => next.add(i.id));
                    } else {
                      items.forEach((i) => next.delete(i.id));
                    }
                    setSelectedIds(next);
                  }}
                  className="rounded border-app-border text-accent focus:ring-accent/30"
                />
                <span className="text-xs text-app-text-muted">
                  {tc('selectAll') || 'Select all'}
                </span>
              </div>
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="flex flex-wrap @md:flex-nowrap items-center gap-2 sm:gap-3 md:gap-4 px-3 sm:px-4 py-3 border-b border-app-border last:border-b-0 hover:bg-app-bg/50 transition-colors group cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      const next = new Set(selectedIds);
                      if (e.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      setSelectedIds(next);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-app-border text-accent focus:ring-accent/30 shrink-0"
                  />
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      width={48}
                      height={48}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover border border-app-border shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-app-bg flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5 text-app-text-muted" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-app-text text-sm break-words">{item.name}</p>
                    <p className="text-xs text-app-text-muted mt-0.5">
                      {item.category?.name || t('uncategorized')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
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
                      'px-2.5 py-1 rounded-full text-xs font-semibold border transition-all shrink-0 whitespace-nowrap',
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg hover:bg-app-hover text-app-text-muted"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(item);
                        }}
                      >
                        <Edit2 className="w-4 h-4 mr-2" /> {t('edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFeatured(item);
                        }}
                      >
                        <Star className="w-4 h-4 mr-2" />{' '}
                        {item.is_featured ? t('removedFromFeatured') : t('addedToFeatured')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item);
                        }}
                        className="text-status-error"
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> {t('delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="w-10 h-10 text-app-text-muted mb-3" />
              <p className="text-sm font-medium text-app-text-secondary mb-1">{t('noItems')}</p>
              <p className="text-xs text-app-text-muted mb-4">{t('noItemsDesc')}</p>
              <Button onClick={openNewModal} size="sm">
                <Plus className="w-4 h-4 mr-1" /> {seg.addItem}
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
                'fixed right-0 top-0 h-full w-full sm:w-96 z-50 bg-app-card border-l border-app-border rounded-l-xl overflow-y-auto',
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

                {/* Description */}
                <div className="space-y-1">
                  <p className="text-xs text-app-text-muted font-medium">{t('descriptionFr')}</p>
                  <p className="text-sm text-app-text">
                    {selectedItem.description || t('noDescription')}
                  </p>
                </div>

                {/* Price */}
                <div className="space-y-1">
                  <p className="text-xs text-app-text-muted font-medium">{t('price')}</p>
                  <p className="text-lg font-bold text-app-text tabular-nums">
                    {formatCurrency(selectedItem.price, currency)}
                  </p>
                  {selectedItem.prices && Object.keys(selectedItem.prices).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {Object.entries(selectedItem.prices as Record<string, number>).map(
                        ([cur, val]) => (
                          <span
                            key={cur}
                            className="text-xs text-app-text-secondary bg-app-elevated px-2 py-0.5 rounded"
                          >
                            {formatCurrency(val, cur as CurrencyCode)}
                          </span>
                        ),
                      )}
                    </div>
                  )}
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
          <form onSubmit={handleSubmit} className="pt-2">
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-6">
              {([1, 2, 3] as const).map((step) => {
                const isActive = formStep === step;
                const isCompleted = formStep > step;
                const labels = [t('stepBasicInfo'), t('stepPricing'), t('stepPhotoDetails')];
                return (
                  <button
                    key={step}
                    type="button"
                    onClick={() => {
                      // Allow navigating back to completed steps freely
                      if (step < formStep) setFormStep(step);
                    }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                      isActive
                        ? 'bg-accent/10 text-accent border-accent/30'
                        : isCompleted
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 cursor-pointer'
                          : 'bg-app-bg text-app-text-muted border-app-border cursor-default',
                    )}
                  >
                    {isCompleted ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <span
                        className={cn(
                          'w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold',
                          isActive ? 'bg-accent text-white' : 'bg-app-border text-app-text-muted',
                        )}
                      >
                        {step}
                      </span>
                    )}
                    <span className="hidden sm:inline">{labels[step - 1]}</span>
                  </button>
                );
              })}
            </div>

            {/* Step 1 — Basic Info */}
            {formStep === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-app-text">{t('nameFr')}</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('nameFrPlaceholder')}
                      className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-app-text">{t('nameEn')}</Label>
                    <Input
                      value={nameEn}
                      onChange={(e) => setNameEn(e.target.value)}
                      placeholder={t('nameEnPlaceholder')}
                      className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30"
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
                      className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-app-text">{t('descriptionEn')}</Label>
                    <Textarea
                      value={descriptionEn}
                      onChange={(e) => setDescriptionEn(e.target.value)}
                      placeholder={t('descriptionEnPlaceholder')}
                      rows={3}
                      className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-app-text">{t('category')}</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="rounded-lg border border-app-border text-app-text focus:ring-accent/30 w-full sm:w-64">
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
            )}

            {/* Step 2 — Pricing & Availability */}
            {formStep === 2 && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <Label className="text-app-text">{t('price')}</Label>
                  <Input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    min={0}
                    className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30 w-full sm:w-48"
                  />
                </div>
                {secondaryCurrencies.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-app-text-muted">{t('optionalPriceHint')}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {secondaryCurrencies.map((cur) => (
                        <div key={cur} className="space-y-1">
                          <Label className="text-app-text text-xs">
                            {t('priceInCurrency', { currency: cur })}
                          </Label>
                          <Input
                            type="number"
                            value={prices[cur] ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPrices((prev) => {
                                if (val === '' || Number(val) === 0) {
                                  const next = { ...prev };
                                  delete next[cur];
                                  return next;
                                }
                                return { ...prev, [cur]: Number(val) };
                              });
                            }}
                            min={0}
                            step={cur === 'XAF' ? 1 : 0.01}
                            placeholder="0"
                            className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
              </div>
            )}

            {/* Step 3 — Photo & Details */}
            {formStep === 3 && (
              <div className="space-y-5">
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
                    onChange={(e) =>
                      setCalories(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    min={0}
                    placeholder={ta('caloriesPlaceholder')}
                    className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30 w-full sm:w-48"
                  />
                </div>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex justify-between gap-3 pt-5 mt-5 border-t border-app-border">
              <div>
                {formStep > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setFormStep((s) => (s - 1) as 1 | 2 | 3)}
                  >
                    {t('previous')}
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
                  {t('cancel')}
                </Button>
                {formStep < 3 ? (
                  <Button
                    type="button"
                    variant="default"
                    onClick={() => {
                      // Validation before advancing
                      if (formStep === 1) {
                        if (!name.trim()) {
                          toast({ title: t('validationNameRequired'), variant: 'destructive' });
                          return;
                        }
                        if (!categoryId) {
                          toast({ title: t('validationCategoryRequired'), variant: 'destructive' });
                          return;
                        }
                      }
                      if (formStep === 2) {
                        if (!price || Number(price) <= 0) {
                          toast({ title: t('validationPriceRequired'), variant: 'destructive' });
                          return;
                        }
                      }
                      setFormStep((s) => (s + 1) as 1 | 2 | 3);
                    }}
                  >
                    {t('next')}
                  </Button>
                ) : (
                  <Button type="submit" disabled={saving} variant="default">
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingItem ? t('update') : t('create')}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </AdminModal>
      </div>
    </RoleGuard>
  );
}
