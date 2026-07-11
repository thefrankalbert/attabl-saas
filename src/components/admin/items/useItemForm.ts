'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { logger } from '@/lib/logger';
import { actionCreateMenuItem, actionUpdateMenuItem } from '@/app/actions/menu-items';
import type { MenuItem, CurrencyCode } from '@/types/admin.types';
import type { FormStep } from './ItemFormModal';

interface UseItemFormParams {
  tenantId: string;
  secondaryCurrencies: CurrencyCode[];
  onSaved: () => void;
}

export function useItemForm({ tenantId, secondaryCurrencies, onSaved }: UseItemFormParams) {
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [price, setPrice] = useState<number | string>(0);
  const [categoryId, setCategoryId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  // Extra gallery photos beyond the primary image_url (item detail carousel).
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [isAvailable, setIsAvailable] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [calories, setCalories] = useState<number | ''>('');
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [formStep, setFormStep] = useState<FormStep>(1);

  const { toast } = useToast();
  const t = useTranslations('items');

  const resetForm = () => {
    setName('');
    setNameEn('');
    setDescription('');
    setDescriptionEn('');
    setPrice(0);
    setCategoryId('');
    setImageUrl('');
    setGalleryImages([]);
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
    setGalleryImages((item.images || []).filter((u) => u && u !== (item.image_url || '')));
    setIsAvailable(item.is_available);
    setIsFeatured(item.is_featured);
    setAllergens(item.allergens || []);
    setCalories(item.calories ?? '');
    setPrices((item.prices as Record<string, number>) || {});
    setFormStep(1);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (saving) return;
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
      };

      // Gallery = primary photo first, then the extra photos. Empty array when
      // there is no primary image (the storefront then shows the placeholder).
      const primary = imageUrl.trim();
      const extras = [...new Set(galleryImages.filter((u) => u && u !== primary))];
      payload.images = primary ? [primary, ...extras] : extras;

      // Only include the prices JSONB field when the tenant has secondary currencies.
      // The column may not exist on DBs where the multi-currency migration was not
      // applied - omitting it entirely avoids a PostgREST column-not-found error.
      if (secondaryCurrencies.length > 0) {
        payload.prices = Object.keys(cleanPrices).length > 0 ? cleanPrices : null;
      }

      if (editingItem) {
        const result = await actionUpdateMenuItem(tenantId, editingItem.id, payload);
        if (result.error) {
          toast({ title: result.error, variant: 'destructive' });
          setSaving(false);
          return;
        }
        toast({ title: t('itemUpdated') });
      } else {
        const result = await actionCreateMenuItem(tenantId, payload);
        if (result.error) {
          toast({ title: result.error, variant: 'destructive' });
          setSaving(false);
          return;
        }
        toast({ title: t('itemCreated') });
      }
      setShowModal(false);
      onSaved();
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

  return {
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
    galleryImages,
    setGalleryImages,
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
  };
}
