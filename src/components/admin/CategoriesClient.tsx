'use client';

import { useState, useCallback, useId, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Plus,
  Loader2,
  Folder,
  GripVertical,
  Utensils,
  Edit2,
  Trash2,
  ChefHat,
  Wine,
  Shuffle,
} from 'lucide-react';
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
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import { useCategories } from '@/hooks/queries';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AdminModal from '@/components/admin/AdminModal';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { CategoryIconPicker } from '@/components/admin/CategoryIconPicker';
import { cn } from '@/lib/utils';
import { suggestIconForName, getLucideIcon } from '@/lib/config/lucide-food-icons';
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
import RoleGuard from '@/components/admin/RoleGuard';
import type { Category, Menu, PreparationZone } from '@/types/admin.types';
import {
  actionCreateCategory,
  actionUpdateCategory,
  actionDeleteCategory,
  actionReorderCategories,
} from '@/app/actions/categories';
import { ListPagination } from '@/components/admin/ListPagination';
import type { ServerListPagination } from '@/lib/pagination';

const LIST_PAGE_SIZE = 25;

interface CategoriesClientProps {
  tenantId: string;
  tenantSlug: string;
  initialCategories: Category[];
  menus: Pick<Menu, 'id' | 'name'>[];
  serverListPagination?: ServerListPagination;
}

type CategoryWithCount = Category & { items_count?: number };

interface SortableRowProps {
  cat: CategoryWithCount;
  onEdit: (cat: CategoryWithCount) => void;
  onDelete: (cat: CategoryWithCount) => void;
}

function SortableRow({ cat, onEdit, onDelete }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 px-4 py-3 border-b border-app-border hover:bg-app-bg/50 transition-colors group',
        isDragging && 'bg-app-bg shadow-sm',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        ref={setActivatorNodeRef}
        className="touch-none cursor-grab active:cursor-grabbing focus:outline-none p-1 -m-1 h-auto w-auto rounded hover:bg-app-bg transition-colors"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4 text-app-text-muted" />
      </Button>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-app-text text-sm">{cat.name}</p>
      </div>
      {cat.preparation_zone && cat.preparation_zone !== 'kitchen' && (
        <div className="flex items-center gap-1 rounded-[0.625rem] border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium normal-case text-[var(--muted-foreground)]">
          {cat.preparation_zone === 'bar' ? (
            <Wine className="w-3 h-3" />
          ) : (
            <Shuffle className="w-3 h-3" />
          )}
          {cat.preparation_zone}
        </div>
      )}
      <div
        className="flex items-center gap-1.5 text-xs text-app-text-muted"
        title={`${cat.items_count || 0} plats`}
      >
        <Utensils className="w-3 h-3" />
        <span className="font-medium tabular-nums">{cat.items_count || 0}</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(cat)}
          className="h-9 w-9 p-0 text-accent hover:text-accent hover:bg-accent/10"
        >
          <Edit2 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(cat)}
          title="Supprimer"
          className="h-9 w-9 p-0 text-[var(--destructive)] hover:bg-[var(--accent)]"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
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
  const seg = useSegmentTerms();
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryWithCount | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [displayOrder, setDisplayOrder] = useState<number | string>(0);
  const [preparationZone, setPreparationZone] = useState<PreparationZone>('kitchen');
  const [isFeaturedOnHome, setIsFeaturedOnHome] = useState<boolean>(false);
  const [menuId, setMenuId] = useState<string>(menus[0]?.id || '');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [iconName, setIconName] = useState<string | null>(null);
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

  const featuredCount = categories.filter((c) => c.is_featured_on_home === true).length;
  const FEATURED_LIMIT = 8;

  const openNewModal = () => {
    setEditingCategory(null);
    setName('');
    setNameEn('');
    setDisplayOrder(categories.length);
    setPreparationZone('kitchen');
    setIsFeaturedOnHome(false);
    setIsActive(true);
    setIconName(null);
    setMenuId(menus[0]?.id || '');
    setShowModal(true);
  };

  const openEditModal = (cat: CategoryWithCount) => {
    setEditingCategory(cat);
    setName(cat.name);
    setNameEn(cat.name_en || '');
    setDisplayOrder(cat.display_order || 0);
    setPreparationZone(cat.preparation_zone || 'kitchen');
    setIsFeaturedOnHome(cat.is_featured_on_home === true);
    setIsActive(cat.is_active !== false);
    setIconName(cat.icon ?? null);
    setMenuId(cat.menu_id || menus[0]?.id || '');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        name_en: nameEn.trim() || null,
        display_order: Number(displayOrder) || 0,
        preparation_zone: preparationZone,
        is_featured_on_home: isFeaturedOnHome,
        is_active: isActive,
        icon: iconName || null,
        tenant_id: tenantId,
        menu_id: menuId || null,
      };
      if (editingCategory) {
        const result = await actionUpdateCategory(tenantId, editingCategory.id, payload);
        if (result.error) {
          toast({ title: result.error, variant: 'destructive' });
          return;
        }
        toast({ title: t('categoryUpdated') });
      } else {
        const result = await actionCreateCategory(tenantId, payload);
        if (result.error) {
          toast({ title: result.error, variant: 'destructive' });
          return;
        }
        toast({ title: t('categoryCreated') });
      }
      setShowModal(false);
      loadCategories();
      revalidateMenuCache(tenantSlug);
    } catch {
      toast({ title: t('saveError'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

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
            subtitle={t('subtitle')}
            count={categories.length}
            actions={
              <Button
                onClick={openNewModal}
                variant="default"
                size="sm"
                className="gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden @sm:inline">{t('newCategory')}</span>
              </Button>
            }
          />
        </div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden mt-4 @sm:mt-6">
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
        <AdminModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={editingCategory ? t('editCategoryTitle') : t('newCategoryTitle')}
          size="lg"
        >
          <form onSubmit={handleSubmit} className="space-y-5 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cat-name" className="text-app-text">
                  {t('nameFr')}
                </Label>
                <Input
                  id="cat-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!iconName) {
                      const suggested = suggestIconForName(e.target.value);
                      if (suggested) setIconName(suggested);
                    }
                  }}
                  placeholder={t('nameFrPlaceholder')}
                  className="rounded-lg border border-app-border text-app-text focus-visible:ring-accent"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-name-en" className="text-app-text">
                  {t('nameEn')}
                </Label>
                <Input
                  id="cat-name-en"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder={t('nameEnPlaceholder')}
                  className="rounded-lg border border-app-border text-app-text focus-visible:ring-accent"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-order" className="text-app-text">
                {t('displayOrder')}
              </Label>
              <Input
                id="cat-order"
                type="number"
                value={displayOrder}
                onChange={(e) =>
                  setDisplayOrder(e.target.value === '' ? '' : Number(e.target.value))
                }
                min={0}
                className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30"
              />
            </div>
            {/* Menu selector */}
            {menus.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="cat-menu" className="text-app-text">
                  {t('menu')}
                </Label>
                <Select value={menuId} onValueChange={setMenuId}>
                  <SelectTrigger id="cat-menu" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {menus.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Featured on home toggle */}
            <div className="space-y-1.5 rounded-lg border border-app-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="cat-featured" className="text-app-text">
                    {t('featuredOnHome')}
                  </Label>
                  <p className="text-xs text-app-text-muted mt-1">{t('featuredOnHomeDesc')}</p>
                </div>
                <Switch
                  id="cat-featured"
                  checked={isFeaturedOnHome}
                  onCheckedChange={setIsFeaturedOnHome}
                />
              </div>
              {isFeaturedOnHome &&
                featuredCount >= FEATURED_LIMIT &&
                !(editingCategory && editingCategory.is_featured_on_home === true) && (
                  <p className="text-xs text-[var(--warning)] font-medium mt-2">
                    {t('featuredOnHomeLimit', { count: FEATURED_LIMIT })}
                  </p>
                )}
            </div>

            {/* Active toggle */}
            <div className="space-y-1.5 rounded-lg border border-app-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Label htmlFor="cat-active" className="text-app-text">
                    {t('isActive')}
                  </Label>
                  <p className="text-xs text-app-text-muted mt-1">{t('isActiveDesc')}</p>
                </div>
                <Switch id="cat-active" checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>

            {/* Icon picker */}
            <div className="space-y-1.5 rounded-lg border border-app-border p-3">
              <div className="flex items-center gap-2 mb-2">
                {iconName &&
                  (() => {
                    const Icon = getLucideIcon(iconName);
                    return <Icon className="w-4 h-4 text-accent shrink-0" />;
                  })()}
                <Label className="text-app-text">{t('icon')}</Label>
              </div>
              <CategoryIconPicker
                value={iconName}
                usedIcons={categories
                  .filter((c) => !editingCategory || c.id !== editingCategory.id)
                  .map((c) => c.icon)
                  .filter((i): i is string => !!i)}
                onChange={setIconName}
              />
            </div>

            {/* Preparation zone selector */}
            <div className="space-y-1.5">
              <Label className="text-app-text">{t('preparationZone')}</Label>
              <p className="text-xs text-app-text-muted">{t('preparationZoneDesc')}</p>
              <div className="grid grid-cols-3 gap-2 pt-1">
                {(
                  [
                    { value: 'kitchen', icon: ChefHat, label: seg.productionZone },
                    { value: 'bar', icon: Wine, label: t('zoneBar') },
                    { value: 'both', icon: Shuffle, label: t('zoneBoth') },
                  ] as const
                ).map(({ value, icon: Icon, label }) => (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    onClick={() => setPreparationZone(value)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 h-auto rounded-lg border text-xs font-medium transition-all',
                      preparationZone === value
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-app-border text-app-text-muted hover:border-app-text-secondary hover:text-app-text-secondary',
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
              <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={saving} variant="default">
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingCategory ? t('update') : t('create')}
              </Button>
            </div>
          </form>
        </AdminModal>

        {/* Delete confirmation dialog */}
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{tc('confirmDelete')}</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget ? t('deleteCategoryConfirm', { name: deleteTarget.name }) : ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90"
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
