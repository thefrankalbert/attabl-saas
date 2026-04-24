'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSessionState } from '@/hooks/useSessionState';
import { useTranslations } from 'next-intl';
import {
  Plus,
  Star,
  Check,
  X,
  Image as ImageIcon,
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/currency';
import { actionCheckCanAddMenuItem } from '@/app/actions/menu-items';
import RoleGuard from '@/components/admin/RoleGuard';
import { logger } from '@/lib/logger';
import { revalidateMenuCache } from '@/lib/revalidate';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import type { MenuItem, Category, CurrencyCode } from '@/types/admin.types';
import { createMenuItemService } from '@/services/menu-item.service';
import { ItemDetailPanel } from './items/ItemDetailPanel';
import { ItemFormModal, type FormStep } from './items/ItemFormModal';

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
  const secondaryCurrencies = supportedCurrencies.filter((c) => c !== currency);
  const [categories] = useState<Category[]>(initialCategories);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useSessionState('items:filterCategory', 'all');
  const [filterAvailable, setFilterAvailable] = useSessionState('items:filterAvailable', 'all');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

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
  const [formStep, setFormStep] = useState<FormStep>(1);

  const { toast } = useToast();
  const t = useTranslations('items');
  const tc = useTranslations('common');
  const seg = useSegmentTerms();
  const supabase = createClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  const closePanel = useCallback(() => setSelectedItem(null), []);

  // Warn before leaving with unsaved form data
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (showModal || saving) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [showModal, saving]);

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

  const handleSubmit = async () => {
    if (formStep !== 3) return;
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
      // applied - omitting it entirely avoids a PostgREST column-not-found error.
      if (secondaryCurrencies.length > 0) {
        payload.prices = Object.keys(cleanPrices).length > 0 ? cleanPrices : null;
      }

      const menuItemService = createMenuItemService(supabase);
      if (editingItem) {
        await menuItemService.updateMenuItem(editingItem.id, payload);
        toast({ title: t('itemUpdated') });
      } else {
        const limitCheck = await actionCheckCanAddMenuItem(tenantId);
        if (limitCheck.error) {
          toast({ title: limitCheck.error, variant: 'destructive' });
          setSaving(false);
          return;
        }
        await menuItemService.createMenuItem(payload);
        toast({ title: t('itemCreated') });
      }
      setShowModal(false);
      loadItems();
      router.refresh();
      revalidateMenuCache();
    } catch (err: unknown) {
      const pgErr = err as { message?: string; code?: string; details?: string; hint?: string };
      logger.error('Failed to save menu item', pgErr.message || err, {
        tenantId,
        editingItemId: editingItem?.id ?? null,
        code: pgErr.code,
        details: pgErr.details,
        hint: pgErr.hint,
      });
      toast({ title: t('saveError'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: MenuItem) => {
    setDeleteTarget({ id: item.id, name: item.name });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const menuItemService = createMenuItemService(supabase);
      await menuItemService.deleteMenuItem(deleteTarget.id);
      toast({ title: t('itemDeleted') });
      loadItems();
      router.refresh();
      revalidateMenuCache();
    } catch {
      toast({ title: t('deleteError'), variant: 'destructive' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const toggleAvailable = async (item: MenuItem) => {
    try {
      const menuItemService = createMenuItemService(supabase);
      await menuItemService.toggleAvailable(item.id, !item.is_available, tenantId);
      loadItems();
      router.refresh();
      revalidateMenuCache();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const toggleFeatured = async (item: MenuItem) => {
    try {
      const menuItemService = createMenuItemService(supabase);
      await menuItemService.toggleFeatured(item.id, !item.is_featured, tenantId);
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
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="shrink-0">
          <div className="flex flex-col @lg:flex-row @lg:items-center gap-3">
            <h1 className="text-lg @sm:text-xl font-bold text-app-text flex items-center gap-2 shrink-0">
              {seg.items}
              <span className="text-sm font-normal text-app-text-muted">({items.length})</span>
            </h1>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-9 w-full @sm:w-44 text-xs rounded-lg border border-app-border text-app-text focus:ring-accent/30">
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
                <SelectTrigger className="h-9 w-full @sm:w-36 text-xs rounded-lg border border-app-border text-app-text focus:ring-accent/30">
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

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 @sm:mt-6">
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 mb-2 rounded-xl bg-accent-muted border border-accent/20">
              <span className="text-sm font-medium text-app-text">{selectedIds.size} selected</span>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const targetAvailability = [...selectedIds].some((id) => {
                    const item = items.find((i) => i.id === id);
                    return item && !item.is_available;
                  });
                  const menuItemService = createMenuItemService(supabase);
                  const results = await Promise.allSettled(
                    [...selectedIds].map((id) => {
                      const item = items.find((i) => i.id === id);
                      if (!item) return Promise.resolve();
                      return menuItemService.toggleAvailable(item.id, targetAvailability, tenantId);
                    }),
                  );
                  const failed = results.filter((r) => r.status === 'rejected');
                  if (failed.length > 0) {
                    toast({ title: tc('error'), variant: 'destructive' });
                  } else {
                    setSelectedIds(new Set());
                  }
                  loadItems();
                  router.refresh();
                  revalidateMenuCache();
                }}
              >
                Toggle availability
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          )}

          {/* Items List */}
          {loading && items.length === 0 ? (
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
                <Checkbox
                  aria-label={tc('selectAll') || 'Select all'}
                  checked={items.length > 0 && items.every((i) => selectedIds.has(i.id))}
                  onCheckedChange={(checked) => {
                    const next = new Set(selectedIds);
                    if (checked) {
                      items.forEach((i) => next.add(i.id));
                    } else {
                      items.forEach((i) => next.delete(i.id));
                    }
                    setSelectedIds(next);
                  }}
                />
                <span className="text-xs text-app-text-muted">
                  {tc('selectAll') || 'Select all'}
                </span>
              </div>
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="flex flex-wrap @md:flex-nowrap items-center gap-2 @sm:gap-3 md:gap-4 px-3 @sm:px-4 py-3 border-b border-app-border last:border-b-0 hover:bg-app-bg/50 transition-colors group cursor-pointer"
                >
                  <Checkbox
                    aria-label={`${tc('select') || 'Select'} ${item.name}`}
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedIds);
                      if (checked) next.add(item.id);
                      else next.delete(item.id);
                      setSelectedIds(next);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  />
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      width={48}
                      height={48}
                      className="w-10 h-10 @sm:w-12 @sm:h-12 rounded-lg object-cover border border-app-border shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 @sm:w-12 @sm:h-12 rounded-lg bg-app-bg flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4 h-4 @sm:w-5 @sm:h-5 text-app-text-muted" />
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
                  <Button
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAvailable(item);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 whitespace-nowrap h-auto',
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
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="More options"
                        onClick={(e) => e.stopPropagation()}
                        className="h-auto w-auto p-1.5 text-app-text-muted"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
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
          <ItemDetailPanel
            item={selectedItem}
            currency={currency}
            onClose={closePanel}
            onEdit={openEditModal}
          />
        )}

        {/* Form Modal */}
        <ItemFormModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            resetForm();
          }}
          editingItem={editingItem}
          categories={categories}
          secondaryCurrencies={secondaryCurrencies}
          saving={saving}
          onSubmit={handleSubmit}
          state={{
            name,
            nameEn,
            description,
            descriptionEn,
            price,
            categoryId,
            imageUrl,
            isAvailable,
            isFeatured,
            allergens,
            calories,
            prices,
            formStep,
          }}
          setters={{
            setName,
            setNameEn,
            setDescription,
            setDescriptionEn,
            setPrice,
            setCategoryId,
            setImageUrl,
            setIsAvailable,
            setIsFeatured,
            setAllergens,
            setCalories,
            setPrices,
            setFormStep,
          }}
        />

        {/* Delete confirmation dialog */}
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{tc('confirmDelete')}</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget ? t('deleteConfirm', { name: deleteTarget.name }) : ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {tc('delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RoleGuard>
  );
}
