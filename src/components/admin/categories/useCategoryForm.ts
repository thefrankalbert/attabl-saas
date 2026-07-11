'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { revalidateMenuCache } from '@/lib/revalidate';
import type { Menu, PreparationZone } from '@/types/admin.types';
import { actionCreateCategory, actionUpdateCategory } from '@/app/actions/categories';
import type { CategoryWithCount } from './types';

interface UseCategoryFormParams {
  tenantId: string;
  tenantSlug: string;
  menus: Pick<Menu, 'id' | 'name'>[];
  categories: CategoryWithCount[];
  loadCategories: () => void;
}

export function useCategoryForm({
  tenantId,
  tenantSlug,
  menus,
  categories,
  loadCategories,
}: UseCategoryFormParams) {
  const t = useTranslations('categories');
  const { toast } = useToast();

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
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const openNewModal = () => {
    setEditingCategory(null);
    setName('');
    setNameEn('');
    setDisplayOrder(categories.length);
    setPreparationZone('kitchen');
    setIsFeaturedOnHome(false);
    setIsActive(true);
    setIconName(null);
    setImageUrl(null);
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
    setImageUrl(cat.image_url ?? null);
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
        image_url: imageUrl || null,
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

  return {
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
  };
}
