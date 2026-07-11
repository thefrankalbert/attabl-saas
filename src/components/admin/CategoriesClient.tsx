'use client';

import { useState, useCallback, useId, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, Folder, GripVertical, Utensils } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { useCategories } from '@/hooks/queries';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { logger } from '@/lib/logger';
import { revalidateMenuCache } from '@/lib/revalidate';
import RoleGuard from '@/components/admin/RoleGuard';
import type { Category, Menu } from '@/types/admin.types';
import { actionDeleteCategory, actionReorderCategories } from '@/app/actions/categories';
import { ListPagination } from '@/components/admin/ListPagination';
import type { ServerListPagination } from '@/lib/pagination';
import type { CategoryWithCount } from '@/components/admin/categories/types';
import { SortableRow } from '@/components/admin/categories/CategorySortableRow';
import { CategoryFormModal } from '@/components/admin/categories/CategoryFormModal';
import { CategoryDeleteDialog } from '@/components/admin/categories/CategoryDeleteDialog';
import { useCategoryForm } from '@/components/admin/categories/useCategoryForm';

const LIST_PAGE_SIZE = 25;

interface CategoriesClientProps {
  tenantId: string;
  tenantSlug: string;
  initialCategories: Category[];
  menus: Pick<Menu, 'id' | 'name'>[];
  serverListPagination?: ServerListPagination;
}

export default function CategoriesClient({
  tenantId,
  tenantSlug,
  initialCategories,
  menus,
  serverListPagination,
}: CategoriesClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const dndId = useId();
  const t = useTranslations('categories');
  const tc = useTranslations('common');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [listPage, setListPage] = useState(0);
  const useServerPagination = !!serverListPagination;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // @dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor),
  );

  // TanStack Query for categories with item count
  const { data: queryCategories = initialCategories as CategoryWithCount[], isLoading } =
    useCategories(tenantId, { withItemCount: true, enabled: !useServerPagination });
  const categories = useServerPagination
    ? (initialCategories as CategoryWithCount[])
    : queryCategories;
  const loading = !useServerPagination && isLoading && categories.length === 0;

  const pageSize = useServerPagination ? serverListPagination.pageSize : LIST_PAGE_SIZE;
  const totalCount = useServerPagination ? serverListPagination.total : categories.length;
  const maxPage = Math.max(0, Math.ceil(totalCount / pageSize) - 1);
  const effectivePage = useServerPagination
    ? Math.min(serverListPagination.page - 1, maxPage)
    : Math.min(listPage, maxPage);

  const pageCategories = useMemo(() => {
    if (useServerPagination) {
      return categories;
    }
    const start = effectivePage * LIST_PAGE_SIZE;
    return categories.slice(start, start + LIST_PAGE_SIZE);
  }, [categories, effectivePage, useServerPagination]);

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

  const loadCategories = useCallback(() => {
    if (useServerPagination) {
      router.refresh();
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['categories', tenantId] });
  }, [queryClient, tenantId, useServerPagination, router]);

  const {
    showModal,
    setShowModal,
    editingCategory,
    saving,
    name,
    setName,
    nameEn,
    setNameEn,
    displayOrder,
    setDisplayOrder,
    preparationZone,
    setPreparationZone,
    isFeaturedOnHome,
    setIsFeaturedOnHome,
    menuId,
    setMenuId,
    isActive,
    setIsActive,
    iconName,
    setIconName,
    imageUrl,
    setImageUrl,
    openNewModal,
    openEditModal,
    handleSubmit,
  } = useCategoryForm({ tenantId, tenantSlug, menus, categories, loadCategories });

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;

      if (!over || active.id === over.id) {
        return;
      }

      if (isReordering) return;

      const oldIndex = categories.findIndex((cat) => cat.id === active.id);
      const newIndex = categories.findIndex((cat) => cat.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      const previous = categories;
      const reordered = arrayMove(categories, oldIndex, newIndex);

      // Optimistic update
      queryClient.setQueryData(['categories', tenantId, true], reordered);

      // Persist to database
      setIsReordering(true);
      try {
        const previousIndexMap = new Map(previous.map((c, i) => [c.id, i]));
        const updates = reordered
          .map((cat, i) => ({ id: cat.id, display_order: i, idx: i }))
          .filter((u) => previousIndexMap.get(u.id) !== u.idx)
          .map(({ id, display_order }) => ({ id, display_order }));
        const result = await actionReorderCategories(tenantId, updates);
        if (result.error) {
          queryClient.setQueryData(['categories', tenantId, true], previous);
          logger.error('Failed to reorder categories', result.error);
          toast({ title: tc('updateError'), variant: 'destructive' });
        } else {
          revalidateMenuCache(tenantSlug);
        }
      } catch (err: unknown) {
        // Rollback on error
        queryClient.setQueryData(['categories', tenantId, true], previous);
        logger.error('Failed to reorder categories', err);
        toast({ title: tc('updateError'), variant: 'destructive' });
      } finally {
        setIsReordering(false);
      }
    },
    [categories, tenantId, tenantSlug, queryClient, toast, tc, isReordering],
  );

  const handleDelete = async (cat: CategoryWithCount) => {
    if (cat.items_count && cat.items_count > 0) {
      toast({
        title: t('categoryHasDishes', { count: cat.items_count }),
        variant: 'destructive',
      });
      return;
    }

    setDeleteTarget({ id: cat.id, name: cat.name });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const result = await actionDeleteCategory(tenantId, deleteTarget.id);
      if (result.error) {
        toast({ title: result.error, variant: 'destructive' });
        return;
      }
      toast({ title: t('categoryDeleted') });
      loadCategories();
      revalidateMenuCache(tenantSlug);
    } catch {
      toast({ title: tc('deleteError'), variant: 'destructive' });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <RoleGuard permission="canManageMenus">
      <div className="h-full flex flex-col overflow-hidden">
        <div className="shrink-0 space-y-4">
          <AdminPageHeader
            title={t('title')}
            actions={
              <Button
                onClick={openNewModal}
                variant="default"
                size="sm"
                className="gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">{t('newCategory')}</span>
              </Button>
            }
          />
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden mt-4 sm:mt-6">
          {loading ? (
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-1">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-app-card border-b border-app-border animate-pulse"
                />
              ))}
            </div>
          ) : categories.length > 0 ? (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide rounded-xl border border-app-border bg-app-card">
                <DndContext
                  id={dndId}
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={pageCategories.map((cat) => cat.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {pageCategories.map((cat) => (
                      <SortableRow
                        key={cat.id}
                        cat={cat}
                        onEdit={openEditModal}
                        onDelete={handleDelete}
                      />
                    ))}
                  </SortableContext>
                  <DragOverlay>
                    {activeDragId
                      ? (() => {
                          const cat = categories.find((c) => c.id === activeDragId);
                          if (!cat) return null;
                          return (
                            <div className="flex items-center gap-4 px-4 py-3 bg-app-bg border-b border-accent shadow-sm">
                              <GripVertical className="w-4 h-4 text-app-text-secondary" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-app-text text-sm">{cat.name}</p>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-app-text-secondary">
                                <Utensils className="w-3.5 h-3.5" />
                                <span className="font-medium">
                                  {t('dishCount', { count: cat.items_count || 0 })}
                                </span>
                              </div>
                            </div>
                          );
                        })()
                      : null}
                  </DragOverlay>
                </DndContext>
              </div>
              <ListPagination
                page={effectivePage}
                pageSize={pageSize}
                totalCount={totalCount}
                onPageChange={handlePageChange}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-14 h-14 bg-app-elevated rounded-xl flex items-center justify-center mx-auto mb-4">
                <Folder className="w-7 h-7 text-app-text-muted" />
              </div>
              <h3 className="text-base font-bold text-app-text">{t('noCategories')}</h3>
              <p className="text-sm text-app-text-secondary mt-2">{t('noCategoriesDesc')}</p>
              <Button onClick={openNewModal} variant="default" className="mt-4">
                {t('createCategory')}
              </Button>
            </div>
          )}
        </div>

        {/* Modal */}
        <CategoryFormModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          editingCategory={editingCategory}
          categories={categories}
          menus={menus}
          saving={saving}
          name={name}
          setName={setName}
          nameEn={nameEn}
          setNameEn={setNameEn}
          displayOrder={displayOrder}
          setDisplayOrder={setDisplayOrder}
          preparationZone={preparationZone}
          setPreparationZone={setPreparationZone}
          isFeaturedOnHome={isFeaturedOnHome}
          setIsFeaturedOnHome={setIsFeaturedOnHome}
          menuId={menuId}
          setMenuId={setMenuId}
          isActive={isActive}
          setIsActive={setIsActive}
          iconName={iconName}
          setIconName={setIconName}
          imageUrl={imageUrl}
          setImageUrl={setImageUrl}
          onSubmit={handleSubmit}
        />

        {/* Delete confirmation dialog */}
        <CategoryDeleteDialog
          deleteTarget={deleteTarget}
          onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      </div>
    </RoleGuard>
  );
}
