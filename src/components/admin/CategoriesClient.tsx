'use client';

import { useState, useCallback, useId } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Loader2, Folder, GripVertical, Utensils, Edit2, Trash2 } from 'lucide-react';
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
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-4 px-4 py-3 border-b border-app-border hover:bg-app-bg/50 transition-colors group',
        isDragging && 'bg-app-bg shadow-sm',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="touch-none cursor-grab active:cursor-grabbing focus:outline-none shrink-0"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4 text-app-text-muted" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-app-text text-sm">{cat.name}</p>
      </div>
      <div
        className="flex items-center gap-1.5 text-xs text-app-text-muted"
        title={`${cat.items_count || 0} plats`}
      >
        <Utensils className="w-3 h-3" />
        <span className="font-medium tabular-nums">{cat.items_count || 0}</span>
      </div>
      <div className="flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shrink-0">
        <Button variant="ghost" size="sm" onClick={() => onEdit(cat)} className="h-8 w-8 p-0">
          <Edit2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(cat)}
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-500/10"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function CategoriesClient({ tenantId, initialCategories }: CategoriesClientProps) {
  const dndId = useId();
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

      const oldIndex = categories.findIndex((cat) => cat.id === active.id);
      const newIndex = categories.findIndex((cat) => cat.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      const reordered = arrayMove(categories, oldIndex, newIndex);

      // Update display_order in database — use individual updates to avoid upsert nulling out columns
      try {
        const updatePromises = reordered.map((cat, i: number) =>
          supabase
            .from('categories')
            .update({ display_order: i })
            .eq('id', cat.id)
            .eq('tenant_id', tenantId),
        );
        const results = await Promise.all(updatePromises);
        const error = results.find((r) => r.error)?.error;
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
      <div className="h-full flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-end gap-2">
          <span className="text-sm text-app-text-muted tabular-nums">({categories.length})</span>
          <Button onClick={openNewModal} variant="default" size="sm" className="gap-2 h-9 shrink-0">
            <Plus className="w-4 h-4" /> {t('newCategory')}
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-2 sm:mt-4">
          {/* List */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-app-card rounded-xl border border-app-border animate-pulse"
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
                <div className="bg-app-card rounded-xl border border-app-border overflow-hidden">
                  {categories.map((cat) => (
                    <SortableRow
                      key={cat.id}
                      cat={cat}
                      onEdit={openEditModal}
                      onDelete={handleDelete}
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
                        <div className="flex items-center gap-4 px-4 py-3 bg-app-card rounded-xl border-2 border-accent shadow-sm">
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
            <div className="bg-app-card rounded-xl border border-app-border p-16 text-center">
              <div className="w-16 h-16 bg-app-bg rounded-xl flex items-center justify-center mx-auto mb-4">
                <Folder className="w-8 h-8 text-app-text-muted" />
              </div>
              <h3 className="text-lg font-bold text-app-text">{t('noCategories')}</h3>
              <p className="text-sm text-app-text-secondary mt-2">{t('noCategoriesDesc')}</p>
              <Button onClick={openNewModal} variant="default" className="mt-6">
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
                onChange={(e) => setDisplayOrder(Number(e.target.value))}
                min={0}
                className="rounded-lg border border-app-border text-app-text focus-visible:ring-accent"
              />
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
      </div>
    </RoleGuard>
  );
}
