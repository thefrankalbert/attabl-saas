'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Loader2, Folder, GripVertical, Utensils } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AdminModal from '@/components/admin/AdminModal';
import type { Category } from '@/types/admin.types';

interface CategoriesClientProps {
  tenantId: string;
  initialCategories: Category[];
}

type CategoryWithCount = Category & { items_count?: number };

export default function CategoriesClient({ tenantId, initialCategories }: CategoriesClientProps) {
  const t = useTranslations('categories');
  const tc = useTranslations('common');
  const [categories, setCategories] = useState<CategoryWithCount[]>(
    initialCategories as CategoryWithCount[],
  );
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryWithCount | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const { toast } = useToast();
  const supabase = createClient();

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*, menu_items(id)')
        .eq('tenant_id', tenantId)
        .order('display_order', { ascending: true });
      if (error) throw error;
      const formatted = (data || []).map((cat: Record<string, unknown>) => ({
        ...cat,
        items_count: (cat.menu_items as unknown[])?.length || 0,
      })) as CategoryWithCount[];
      setCategories(formatted);
    } catch {
      toast({ title: tc('errorLoading'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, tenantId, toast]);

  useEffect(() => {
    if (initialCategories.length === 0) loadCategories();
  }, [initialCategories, loadCategories]);

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
      toast({ title: tc('errorSaving'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: CategoryWithCount) => {
    if (cat.items_count && cat.items_count > 0) {
      toast({
        title: t('categoryHasItems', { count: cat.items_count }),
        variant: 'destructive',
      });
      return;
    }
    if (!confirm(t('confirmDelete', { name: cat.name }))) return;
    try {
      const { error } = await supabase.from('categories').delete().eq('id', cat.id);
      if (error) throw error;
      toast({ title: t('categoryDeleted') });
      loadCategories();
    } catch {
      toast({ title: tc('errorDeleting'), variant: 'destructive' });
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
        <Button onClick={openNewModal} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> {t('newCategory')}
        </Button>
      </div>

      {/* Counter */}
      <div className="flex items-center gap-2 px-4 py-3 bg-white rounded-xl border border-neutral-100">
        <Folder className="w-4 h-4 text-neutral-400" />
        <span className="text-xs text-neutral-500 font-medium">
          {categories.length} {t('categoriesCount')}
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
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-4 p-4 bg-white rounded-xl border border-neutral-100 hover:bg-neutral-50/50 transition-colors group"
            >
              <GripVertical className="w-4 h-4 text-neutral-300" />
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
                  {cat.items_count || 0} {t('dishesCount')}
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
          <Button onClick={openNewModal} className="mt-6">
            {t('createCategory')}
          </Button>
        </div>
      )}

      {/* Modal */}
      <AdminModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingCategory ? t('editCategory') : t('newCategory')}
      >
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">{t('nameFr')}</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Entrées"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-name-en">{t('nameEn')}</Label>
              <Input
                id="cat-name-en"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="Ex: Starters"
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
            <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingCategory ? 'Mettre à jour' : 'Créer'}
            </Button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
