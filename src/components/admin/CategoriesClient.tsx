'use client';

import { useState, useCallback, useId } from 'react';
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
import { createClient } from '@/lib/supabase/client';
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
import { cn } from '@/lib/utils';
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
import { createCategoryService } from '@/services/category.service';

interface CategoriesClientProps {
  tenantId: string;
  initialCategories: Category[];
  menus: Pick<Menu, 'id' | 'name'>[];
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
        <div
          className={cn(
            'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide',
            cat.preparation_zone === 'bar'
              ? 'bg-purple-500/10 text-purple-400'
              : 'bg-blue-500/10 text-blue-400',
          )}
        >
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
          className="h-9 w-9 p-0 text-red-600 hover:text-red-700 hover:bg-red-500/10"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function CategoriesClient({
  tenantId,
  initialCategories,
  menus,
}: CategoriesClientProps) {
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
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();
  const supabase = createClient();
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
  const { data: categories = initialCategories as CategoryWithCount[], isLoading } = useCategories(
    tenantId,
    { withItemCount: true },
  );
  const loading = isLoading && categories.length === 0;

  const loadCategories = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['categories', tenantId] });
  }, [queryClient, tenantId]);

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
        const updatePromises = reordered
          .map((cat, i) => ({ cat, i }))
          .filter(({ cat, i }) => previousIndexMap.get(cat.id) !== i)
          .map(({ cat, i }) =>
            supabase
              .from('categories')
              .update({ display_order: i })
              .eq('id', cat.id)
              .eq('tenant_id', tenantId),
          );
        const results = await Promise.all(updatePromises);
        const error = results.find((r) => r.error)?.error;
        if (error) throw error;
        revalidateMenuCache();
      } catch (err: unknown) {
        // Rollback on error
        queryClient.setQueryData(['categories', tenantId, true], previous);
        logger.error('Failed to reorder categories', err);
        toast({ title: tc('updateError'), variant: 'destructive' });
      } finally {
        setIsReordering(false);
      }
    },
    [categories, supabase, tenantId, queryClient, toast, tc, isReordering],
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
        tenant_id: tenantId,
        menu_id: menuId || null,
      };
      const categoryService = createCategoryService(supabase);
      if (editingCategory) {
        await categoryService.updateCategory(editingCategory.id, payload);
        toast({ title: t('categoryUpdated') });
      } else {
        await categoryService.createCategory(payload);
        toast({ title: t('categoryCreated') });
      }
      setShowModal(false);
      loadCategories();
      revalidateMenuCache();
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

    // Check if category is linked to any menu
    const { data: menuLinks } = await supabase
      .from('menu_categories')
      .select('id')
      .eq('category_id', cat.id)
      .limit(1);

    if (menuLinks && menuLinks.length > 0) {
      toast({
        title: t('categoryLinkedToMenu') || 'Cette categorie est liee a un menu',
        variant: 'destructive',
      });
      return;
    }

    setDeleteTarget({ id: cat.id, name: cat.name });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const categoryService = createCategoryService(supabase);
      await categoryService.deleteCategory(deleteTarget.id);
      toast({ title: t('categoryDeleted') });
      loadCategories();
      revalidateMenuCache();
    } catch {
      toast({ title: tc('deleteError'), variant: 'destructive' });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <RoleGuard permission="canManageMenus">
      <div className="h-full flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center gap-3">
          <span className="text-xs font-bold text-app-text-secondary border border-app-border px-2.5 py-0.5 rounded-full tabular-nums shrink-0">
            {categories.length}
          </span>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <Button onClick={openNewModal} variant="default" size="sm" className="gap-1.5 shrink-0">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{t('newCategory')}</span>
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6">
          {/* List */}
          {loading ? (
            <div className="space-y-1">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 bg-app-card border-b border-app-border animate-pulse"
                />
              ))}
            </div>
          ) : categories.length > 0 ? (
            <DndContext
              id={dndId}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={categories.map((cat) => cat.id)}
                strategy={verticalListSortingStrategy}
              >
                {categories.map((cat) => (
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
          ) : (
            <div className="p-12 text-center">
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
                  onChange={(e) => setName(e.target.value)}
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
                  <p className="text-xs text-amber-500 font-medium mt-2">
                    {t('featuredOnHomeLimit', { count: FEATURED_LIMIT })}
                  </p>
                )}
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
