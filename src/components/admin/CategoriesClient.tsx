'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Loader2, Folder, GripVertical, Utensils } from 'lucide-react';
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
import AdminModal from '@/components/admin/AdminModal';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import RoleGuard from '@/components/admin/RoleGuard';
import type { Category } from '@/types/admin.types';

interface CategoriesClientProps {
  tenantId: string;
  initialCategories: Category[];
}

type CategoryWithCount = Category & { items_count?: number };

interface SortableRowProps {
  cat: CategoryWithCount;
  onEdit: (cat: CategoryWithCount) => void;
  onDelete: (cat: CategoryWithCount) => void;
  editLabel: string;
  deleteLabel: string;
  dishCountLabel: string;
}

function SortableRow({
  cat,
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
  dishCountLabel,
}: SortableRowProps) {
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
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-4 p-4 bg-surface-primary rounded-xl border border-border-default hover:bg-surface-secondary transition-colors group',
        isDragging && 'shadow-none border-border-accent bg-surface-accent',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="touch-none cursor-grab active:cursor-grabbing focus:outline-none p-1 -m-1 rounded hover:bg-surface-secondary transition-colors"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4 text-text-muted group-hover:text-text-secondary transition-colors" />
      </button>
      <div className="w-9 h-9 bg-surface-secondary rounded-lg flex items-center justify-center">
        <Folder className="w-4 h-4 text-text-secondary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-text-primary text-sm">{cat.name}</p>
        {cat.name_en && <p className="text-xs text-text-muted">{cat.name_en}</p>}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-text-secondary">
        <Utensils className="w-3.5 h-3.5" />
        <span className="font-medium">{dishCountLabel}</span>
      </div>
      <div className="flex items-center gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
        <Button variant="outline" size="sm" onClick={() => onEdit(cat)} className="text-xs h-8">
          {editLabel}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(cat)}
          className="text-xs h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          {deleteLabel}
        </Button>
      </div>
    </div>
  );
}

export default function CategoriesClient({ tenantId, initialCategories }: CategoriesClientProps) {
  const t = useTranslations('categories');
  const tc = useTranslations('common');
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryWithCount | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
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
  const { data: categories = initialCategories as CategoryWithCount[], isLoading: loading } =
    useCategories(tenantId, { withItemCount: true });

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

      const oldIndex = categories.findIndex((cat) => cat.id === active.id);
      const newIndex = categories.findIndex((cat) => cat.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      const reordered = arrayMove(categories, oldIndex, newIndex);

      // Update display_order in database
      try {
        const updates = reordered.map((cat, i: number) => ({
          id: cat.id,
          display_order: i,
          tenant_id: tenantId,
          name: cat.name,
        }));
        const { error } = await supabase.from('categories').upsert(updates);
        if (error) throw error;
        loadCategories();
      } catch (err: unknown) {
        logger.error('Failed to reorder categories', err);
        toast({ title: tc('updateError'), variant: 'destructive' });
        loadCategories();
      }
    },
    [categories, supabase, tenantId, loadCategories, toast, tc],
  );

  const openNewModal = () => {
    setEditingCategory(null);
    setName('');
    setNameEn('');
    setDisplayOrder(categories.length);
    setShowModal(true);
  };

  const openEditModal = (cat: CategoryWithCount) => {
    setEditingCategory(cat);
    setName(cat.name);
    setNameEn(cat.name_en || '');
    setDisplayOrder(cat.display_order || 0);
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
        display_order: displayOrder,
        tenant_id: tenantId,
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
      setShowModal(false);
      loadCategories();
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
    if (!confirm(t('deleteCategoryConfirm', { name: cat.name }))) return;
    try {
      const { error } = await supabase.from('categories').delete().eq('id', cat.id);
      if (error) throw error;
      toast({ title: t('categoryDeleted') });
      loadCategories();
    } catch {
      toast({ title: tc('deleteError'), variant: 'destructive' });
    }
  };

  return (
    <RoleGuard permission="canManageMenus">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">{t('title')}</h1>
            <p className="text-xs text-text-secondary mt-1">{t('subtitle')}</p>
          </div>
          <Button onClick={openNewModal} variant="default" size="sm" className="gap-2">
            <Plus className="w-4 h-4" /> {t('newCategory')}
          </Button>
        </div>

        {/* Counter */}
        <div className="flex items-center gap-2 px-4 py-3 bg-surface-primary rounded-xl border border-border-default">
          <Folder className="w-4 h-4 text-text-muted" />
          <span className="text-xs text-text-secondary font-medium">
            {t('categoryCount', { count: categories.length })}
          </span>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 bg-surface-primary rounded-xl border border-border-default animate-pulse"
              />
            ))}
          </div>
        ) : categories.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={categories.map((cat) => cat.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {categories.map((cat) => (
                  <SortableRow
                    key={cat.id}
                    cat={cat}
                    onEdit={openEditModal}
                    onDelete={handleDelete}
                    editLabel={tc('edit')}
                    deleteLabel={tc('delete')}
                    dishCountLabel={t('dishCount', { count: cat.items_count || 0 })}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeDragId
                ? (() => {
                    const cat = categories.find((c) => c.id === activeDragId);
                    if (!cat) return null;
                    return (
                      <div className="flex items-center gap-4 p-4 bg-surface-primary rounded-xl border-2 border-border-accent shadow-none">
                        <GripVertical className="w-4 h-4 text-text-secondary" />
                        <div className="w-9 h-9 bg-surface-secondary rounded-lg flex items-center justify-center">
                          <Folder className="w-4 h-4 text-text-secondary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-text-primary text-sm">{cat.name}</p>
                          {cat.name_en && <p className="text-xs text-text-muted">{cat.name_en}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
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
          <div className="bg-surface-primary rounded-xl border border-border-default p-16 text-center">
            <div className="w-16 h-16 bg-surface-secondary rounded-xl flex items-center justify-center mx-auto mb-4">
              <Folder className="w-8 h-8 text-text-muted" />
            </div>
            <h3 className="text-lg font-bold text-text-primary">{t('noCategories')}</h3>
            <p className="text-sm text-text-secondary mt-2">{t('noCategoriesDesc')}</p>
            <Button onClick={openNewModal} variant="default" className="mt-6">
              {t('createCategory')}
            </Button>
          </div>
        )}

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
                <Label htmlFor="cat-name" className="text-text-primary">
                  {t('nameFr')}
                </Label>
                <Input
                  id="cat-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('nameFrPlaceholder')}
                  className="rounded-lg border border-border-default text-text-primary focus-visible:ring-lime-400"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-name-en" className="text-text-primary">
                  {t('nameEn')}
                </Label>
                <Input
                  id="cat-name-en"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder={t('nameEnPlaceholder')}
                  className="rounded-lg border border-border-default text-text-primary focus-visible:ring-lime-400"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-order" className="text-text-primary">
                {t('displayOrder')}
              </Label>
              <Input
                id="cat-order"
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(Number(e.target.value))}
                min={0}
                className="rounded-lg border border-border-default text-text-primary focus-visible:ring-lime-400"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-border-default">
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
      </div>
    </RoleGuard>
  );
}
