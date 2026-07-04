'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSessionState } from '@/hooks/useSessionState';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useMenuItems } from '@/hooks/queries';
import { useToast } from '@/components/ui/use-toast';
import {
  actionDeleteMenuItem,
  actionToggleMenuItemAvailable,
  actionToggleMenuItemFeatured,
} from '@/app/actions/menu-items';
import RoleGuard from '@/components/admin/RoleGuard';
import { logger } from '@/lib/logger';
import { revalidateMenuCache } from '@/lib/revalidate';
import type { MenuItem, Category, CurrencyCode } from '@/types/admin.types';
import { ItemDetailPanel } from './items/ItemDetailPanel';
import { ItemFormModal } from './items/ItemFormModal';
import { ItemsHeader } from './items/ItemsHeader';
import { ItemsList } from './items/ItemsList';
import { ItemDeleteDialog } from './items/ItemDeleteDialog';
import { useItemForm } from './items/useItemForm';
import type { ServerListPagination } from '@/lib/pagination';

const LIST_PAGE_SIZE = 25;
const AVAILABLE_FILTERS = ['all', 'available', 'unavailable'] as const;

interface ItemsClientProps {
  tenantId: string;
  tenantSlug: string;
  initialItems: MenuItem[];
  initialCategories: Category[];
  currency?: CurrencyCode;
  supportedCurrencies?: CurrencyCode[];
  serverListPagination?: ServerListPagination;
}

export default function ItemsClient({
  tenantId,
  tenantSlug,
  initialItems,
  initialCategories,
  currency = 'XAF',
  supportedCurrencies = [],
  serverListPagination,
}: ItemsClientProps) {
  const pathname = usePathname();
  const secondaryCurrencies = supportedCurrencies.filter((c) => c !== currency);
  const [categories] = useState<Category[]>(initialCategories);
  const [filterCategory, setFilterCategory] = useSessionState('items:filterCategory', 'all');
  const [filterAvailable, setFilterAvailable] = useSessionState('items:filterAvailable', 'all');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [listPage, setListPage] = useState(0);

  const { toast } = useToast();
  const t = useTranslations('items');
  const tc = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();

  const closePanel = useCallback(() => setSelectedItem(null), []);

  const categoryFilterValue =
    filterCategory === 'all' || categories.some((c) => c.id === filterCategory)
      ? filterCategory
      : 'all';

  const availableFilterValue = (AVAILABLE_FILTERS as readonly string[]).includes(filterAvailable)
    ? filterAvailable
    : 'all';

  const isDefaultFilters = categoryFilterValue === 'all' && availableFilterValue === 'all';
  const useServerPagination = !!serverListPagination && isDefaultFilters;

  const {
    data: queryItems,
    isLoading: loading,
    isError,
  } = useMenuItems(tenantId, {
    categoryId: categoryFilterValue,
    availableFilter: availableFilterValue,
    withCategory: true,
    withVariants: false,
    initialData: isDefaultFilters ? initialItems : undefined,
    enabled: !useServerPagination,
  });

  const items = useMemo(() => {
    if (useServerPagination) {
      return initialItems;
    }
    return queryItems ?? (isDefaultFilters ? initialItems : []);
  }, [queryItems, isDefaultFilters, initialItems, useServerPagination]);

  const hasActiveFilters = !isDefaultFilters;

  const pageSize = useServerPagination ? serverListPagination.pageSize : LIST_PAGE_SIZE;
  const totalCount = useServerPagination ? serverListPagination.total : items.length;
  const maxPage = Math.max(0, Math.ceil(totalCount / pageSize) - 1);
  const effectivePage = useServerPagination
    ? Math.min(serverListPagination.page - 1, maxPage)
    : Math.min(listPage, maxPage);

  const pageItems = useMemo(() => {
    if (useServerPagination) {
      return items;
    }
    const start = effectivePage * LIST_PAGE_SIZE;
    return items.slice(start, start + LIST_PAGE_SIZE);
  }, [items, effectivePage, useServerPagination]);

  const handlePageChange = useCallback(
    (page: number) => {
      if (useServerPagination) {
        const params = new URLSearchParams();
        if (page > 0) {
          params.set('page', String(page + 1));
        }
        const qs = params.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
        return;
      }
      setListPage(Math.max(0, Math.min(page, maxPage)));
    },
    [useServerPagination, router, pathname, maxPage],
  );

  const clearFilters = useCallback(() => {
    setFilterCategory('all');
    setFilterAvailable('all');
    setListPage(0);
  }, [setFilterCategory, setFilterAvailable]);

  useEffect(() => {
    if (isError) {
      toast({ title: tc('loadingError'), variant: 'destructive' });
    }
  }, [isError, toast, tc]);

  const loadItems = () => {
    if (useServerPagination) {
      router.refresh();
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['menu-items', tenantId] });
  };

  const {
    showModal,
    setShowModal,
    editingItem,
    saving,
    name,
    setName,
    nameEn,
    setNameEn,
    description,
    setDescription,
    descriptionEn,
    setDescriptionEn,
    price,
    setPrice,
    categoryId,
    setCategoryId,
    imageUrl,
    setImageUrl,
    isAvailable,
    setIsAvailable,
    isFeatured,
    setIsFeatured,
    allergens,
    setAllergens,
    calories,
    setCalories,
    prices,
    setPrices,
    formStep,
    setFormStep,
    resetForm,
    openNewModal,
    openEditModal,
    handleSubmit,
  } = useItemForm({
    tenantId,
    secondaryCurrencies,
    onSaved: () => {
      loadItems();
      router.refresh();
      revalidateMenuCache(tenantSlug);
    },
  });

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

  const handleDelete = (item: MenuItem) => {
    setDeleteTarget({ id: item.id, name: item.name });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      const result = await actionDeleteMenuItem(tenantId, target.id);
      if (result.error) {
        toast({ title: result.error, variant: 'destructive' });
        setDeleteTarget(null);
        return;
      }
      toast({ title: t('itemDeleted') });
      setDeleteTarget(null);
      loadItems();
      router.refresh();
      revalidateMenuCache(tenantSlug);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('deleteError');
      logger.error('Failed to delete menu item', err, { itemId: target.id, tenantId });
      toast({ title: message, variant: 'destructive' });
      setDeleteTarget(null);
    }
  };

  const toggleAvailable = async (item: MenuItem) => {
    const result = await actionToggleMenuItemAvailable(tenantId, item.id, !item.is_available);
    if (result.error) {
      toast({ title: result.error, variant: 'destructive' });
      return;
    }
    loadItems();
    router.refresh();
    revalidateMenuCache(tenantSlug);
  };

  const toggleFeatured = async (item: MenuItem) => {
    const result = await actionToggleMenuItemFeatured(tenantId, item.id, !item.is_featured);
    if (result.error) {
      toast({ title: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: item.is_featured ? t('removedFromFeatured') : t('addedToFeatured') });
    loadItems();
    router.refresh();
    revalidateMenuCache(tenantSlug);
  };

  return (
    <RoleGuard permission="canManageMenus">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="shrink-0 space-y-4">
          <ItemsHeader
            categories={categories}
            categoryFilterValue={categoryFilterValue}
            availableFilterValue={availableFilterValue}
            onCategoryChange={(value) => {
              setListPage(0);
              setFilterCategory(value);
            }}
            onAvailableChange={(value) => {
              setListPage(0);
              setFilterAvailable(value);
            }}
            onAddItem={openNewModal}
          />
        </div>

        <ItemsList
          items={items}
          pageItems={pageItems}
          loading={loading}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          currency={currency}
          loadItems={loadItems}
          toggleAvailable={toggleAvailable}
          toggleFeatured={toggleFeatured}
          onEditItem={openEditModal}
          onDeleteItem={handleDelete}
          onSelectItem={setSelectedItem}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
          onAddItem={openNewModal}
          effectivePage={effectivePage}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={handlePageChange}
        />

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
        <ItemDeleteDialog
          deleteTarget={deleteTarget}
          onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      </div>
    </RoleGuard>
  );
}
