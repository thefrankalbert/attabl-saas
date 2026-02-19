'use client';

import { useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Loader2, Folder, GripVertical, Utensils } from 'lucide-react';
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
import type { Category } from '@/types/admin.types';

interface CategoriesClientProps {
  tenantId: string;
  initialCategories: Category[];
}

type CategoryWithCount = Category & { items_count?: number };

export default function CategoriesClient({ tenantId, initialCategories }: CategoriesClientProps) {
  const t = useTranslations('categories');
  const tc = useTranslations('common');
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryWithCount | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const { toast } = useToast();
  const supabase = createClient();
  const queryClient = useQueryClient();

  // Drag-and-drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  // TanStack Query for categories with item count
  const { data: categories = initialCategories as CategoryWithCount[], isLoading: loading } =
    useCategories(tenantId, { withItemCount: true });

  const loadCategories = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['categories', tenantId] });
  }, [queryClient, tenantId]);

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDragIndex(index);
    dragNodeRef.current = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    // Make the drag image slightly transparent
    requestAnimationFrame(() => {
      if (dragNodeRef.current) dragNodeRef.current.style.opacity = '0.5';
    });
  }, []);

  const handleDragEnd = useCallback(async () => {
    if (dragNodeRef.current) dragNodeRef.current.style.opacity = '1';
    if (dragIndex === null || dragOverIndex === null || dragIndex === dragOverIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder categories
    const reordered = [...categories];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dragOverIndex, 0, moved);

    setDragIndex(null);
    setDragOverIndex(null);

    // Update display_order in database
    try {
      const updates = reordered.map((cat, i) => ({
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
  }, [dragIndex, dragOverIndex, categories, supabase, tenantId, loadCategories, toast, tc]);

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
      toast({ title: t('deleteError'), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight">{t('title')}</h1>
          <p className="text-xs text-neutral-500 mt-1">{t('subtitle')}</p>
        </div>
        <Button onClick={openNewModal} variant="lime" size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> {t('newCategory')}
        </Button>
      </div>

      {/* Counter */}
      <div className="flex items-center gap-2 px-4 py-3 bg-white rounded-xl border border-neutral-100">
        <Folder className="w-4 h-4 text-neutral-400" />
        <span className="text-xs text-neutral-500 font-medium">
          {t('categoryCount', { count: categories.length })}
        </span>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 bg-white rounded-xl border border-neutral-100 animate-pulse"
            />
          ))}
        </div>
      ) : categories.length > 0 ? (
        <div className="space-y-2">
          {categories.map((cat, index) => (
            <div
              key={cat.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverIndex(index);
              }}
              onDragEnd={handleDragEnd}
              className={cn(
                'flex items-center gap-4 p-4 bg-white rounded-xl border border-neutral-100 hover:bg-neutral-50/50 transition-colors group',
                dragOverIndex === index &&
                  dragIndex !== null &&
                  dragIndex !== index &&
                  'border-[#CCFF00] bg-lime-50/30',
              )}
            >
              <GripVertical className="w-4 h-4 text-neutral-300 cursor-grab active:cursor-grabbing" />
              <div className="w-9 h-9 bg-neutral-100 rounded-lg flex items-center justify-center">
                <Folder className="w-4 h-4 text-neutral-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-neutral-900 text-sm">{cat.name}</p>
                {cat.name_en && <p className="text-xs text-neutral-400">{cat.name_en}</p>}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                <Utensils className="w-3.5 h-3.5" />
                <span className="font-medium">
                  {t('dishCount', { count: cat.items_count || 0 })}
                </span>
              </div>
              <div className="flex items-center gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditModal(cat)}
                  className="text-xs h-8"
                >
                  {tc('edit')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(cat)}
                  className="text-xs h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  {tc('delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-100 p-16 text-center">
          <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Folder className="w-8 h-8 text-neutral-400" />
          </div>
          <h3 className="text-lg font-bold text-neutral-900">{t('noCategories')}</h3>
          <p className="text-sm text-neutral-500 mt-2">{t('noCategoriesDesc')}</p>
          <Button onClick={openNewModal} variant="lime" className="mt-6">
            {t('createCategory')}
          </Button>
        </div>
      )}

      {/* Modal */}
      <AdminModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingCategory ? t('editCategoryTitle') : t('newCategoryTitle')}
      >
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">{t('nameFr')}</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('nameFrPlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-name-en">{t('nameEn')}</Label>
              <Input
                id="cat-name-en"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder={t('nameEnPlaceholder')}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-order">{t('displayOrder')}</Label>
            <Input
              id="cat-order"
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value))}
              min={0}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={saving} variant="lime">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingCategory ? t('update') : t('create')}
            </Button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
