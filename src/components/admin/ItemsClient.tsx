'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Loader2, Star, Check, X, Image as ImageIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/currency';
import { checkCanAddMenuItemAction } from '@/app/actions/menu-items';
import type { MenuItem, Category, CurrencyCode } from '@/types/admin.types';

interface ItemsClientProps {
  tenantId: string;
  initialItems: MenuItem[];
  initialCategories: Category[];
  currency?: CurrencyCode;
}

export default function ItemsClient({
  tenantId,
  initialItems,
  initialCategories,
  currency = 'XAF',
}: ItemsClientProps) {
  const [items, setItems] = useState<MenuItem[]>(initialItems);
  const [categories] = useState<Category[]>(initialCategories);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterAvailable, setFilterAvailable] = useState('all');

  // Form state
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [price, setPrice] = useState(0);
  const [categoryId, setCategoryId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);

  const { toast } = useToast();
  const t = useTranslations('items');
  const tc = useTranslations('common');
  const supabase = createClient();

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('menu_items')
        .select('*, categories(id, name)')
        .eq('tenant_id', tenantId)
        .order('name');
      if (filterCategory !== 'all') query = query.eq('category_id', filterCategory);
      if (filterAvailable !== 'all')
        query = query.eq('is_available', filterAvailable === 'available');
      const { data, error } = await query;
      if (error) throw error;
      const formatted: MenuItem[] = (data || []).map((item: Record<string, unknown>) => ({
        ...item,
        category: item.categories as Category,
      })) as MenuItem[];
      setItems(formatted);
    } catch {
      toast({ title: t('loadingError'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [supabase, tenantId, filterCategory, filterAvailable, toast, t]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

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
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !categoryId) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        name_en: nameEn.trim() || null,
        description: description.trim() || null,
        description_en: descriptionEn.trim() || null,
        price,
        category_id: categoryId,
        image_url: imageUrl.trim() || null,
        is_available: isAvailable,
        is_featured: isFeatured,
        tenant_id: tenantId,
      };
      if (editingItem) {
        const { error } = await supabase
          .from('menu_items')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
        toast({ title: t('itemUpdated') });
      } else {
        // Vérifier les limites du plan avant la création
        const limitCheck = await checkCanAddMenuItemAction(tenantId);
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
    } catch {
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
    } catch {
      toast({ title: t('deleteError'), variant: 'destructive' });
    }
  };

  const toggleAvailable = async (item: MenuItem) => {
    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_available: !item.is_available })
        .eq('id', item.id);
      if (error) throw error;
      loadItems();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  const toggleFeatured = async (item: MenuItem) => {
    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_featured: !item.is_featured })
        .eq('id', item.id);
      if (error) throw error;
      toast({ title: item.is_featured ? t('removedFromFeatured') : t('addedToFeatured') });
      loadItems();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
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
          <Plus className="w-4 h-4" /> {t('newItem')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-white rounded-xl border border-neutral-100">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-9 w-full sm:w-[200px] text-xs">
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
          <SelectTrigger className="h-9 w-full sm:w-[150px] text-xs">
            <SelectValue placeholder={t('all')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            <SelectItem value="available">{t('inStock')}</SelectItem>
            <SelectItem value="unavailable">{t('outOfStock')}</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-neutral-400 font-medium">
          {items.length} article{items.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Items List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 bg-white rounded-xl border border-neutral-100 animate-pulse"
            />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap md:flex-nowrap items-center gap-3 md:gap-4 p-4 bg-white rounded-xl border border-neutral-100 hover:bg-neutral-50/50 transition-colors group"
            >
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="w-12 h-12 rounded-lg object-cover border border-neutral-100"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center">
                  <ImageIcon className="w-5 h-5 text-neutral-300" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-neutral-900 text-sm truncate">{item.name}</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {item.category?.name || t('uncategorized')}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-neutral-900 text-sm tabular-nums">
                  {formatCurrency(item.price, currency)}
                </p>
              </div>
              <button
                onClick={() => toggleAvailable(item)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-semibold border transition-all',
                  item.is_available
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                    : 'bg-neutral-100 text-neutral-500 border-neutral-200',
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
              <button
                onClick={() => toggleFeatured(item)}
                className={cn(
                  'p-2 rounded-lg transition-all',
                  item.is_featured
                    ? 'text-amber-500 bg-amber-50'
                    : 'text-neutral-300 hover:text-amber-500 hover:bg-neutral-50',
                )}
              >
                <Star className={cn('w-4 h-4', item.is_featured && 'fill-current')} />
              </button>
              <div className="flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditModal(item)}
                  className="text-xs h-8"
                >
                  {t('edit')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(item)}
                  className="text-xs h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  {t('delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-100 p-16 text-center">
          <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ImageIcon className="w-8 h-8 text-neutral-400" />
          </div>
          <h3 className="text-lg font-bold text-neutral-900">{t('noItems')}</h3>
          <p className="text-sm text-neutral-500 mt-2">{t('noItemsDesc')}</p>
          <Button onClick={openNewModal} className="mt-6">
            {t('addItem')}
          </Button>
        </div>
      )}

      {/* Modal */}
      <AdminModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingItem ? t('editItemTitle') : t('newItemTitle')}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('nameFr')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('nameFrPlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('nameEn')}</Label>
              <Input
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder={t('nameEnPlaceholder')}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('descriptionFr')}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('descriptionFrPlaceholder')}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('descriptionEn')}</Label>
              <Textarea
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
                placeholder={t('descriptionEnPlaceholder')}
                rows={3}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('price')}</Label>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                min={0}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('category')}</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
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
          <div className="space-y-2">
            <Label>{t('imageUrl')}</Label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="flex items-center gap-6 pt-2">
            <div className="flex items-center gap-2">
              <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
              <Label className="text-sm">{t('available')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
              <Label className="text-sm">{t('featured')}</Label>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingItem ? t('update') : t('create')}
            </Button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
