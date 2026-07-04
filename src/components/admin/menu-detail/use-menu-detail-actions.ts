'use client';

import { actionUpdateMenu } from '@/app/actions/menus';
import {
  actionToggleCategoryActive,
  actionCreateCategory,
  actionUpdateCategory,
  actionDeleteCategory,
  actionAssignCategoryToMenu,
} from '@/app/actions/categories';
import {
  actionUpdateMenuItem,
  actionToggleMenuItemAvailable,
  actionUpdateMenuItemPrice,
} from '@/app/actions/menu-items';
import { revalidateMenuCache } from '@/lib/revalidate';
import type { Category, MenuItem } from '@/types/admin.types';
import type { MenuDetailState } from './use-menu-detail-state';

export function useMenuDetailActions(state: MenuDetailState) {
  const {
    tenantId,
    t,
    tc,
    tCat,
    toast,
    menu,
    setMenu,
    categories,
    setCategories,
    items,
    setItems,
    setShowAssignDropdown,
    setAssigningCategory,
    setShowCategoryModal,
    setEditingCategory,
    catName,
    setCatName,
    catNameEn,
    setCatNameEn,
    catOrder,
    setCatOrder,
    setSavingCategory,
    editingCategory,
    editingItem,
    setEditingItem,
    itemFormName,
    setItemFormName,
    itemFormDescription,
    setItemFormDescription,
    itemFormPrice,
    setItemFormPrice,
    itemFormAvailable,
    setItemFormAvailable,
    itemFormImageUrl,
    setItemFormImageUrl,
    setSavingItem,
    editingPriceValue,
    setEditingPriceId,
    setEditingPriceValue,
    priceInputRef,
    deleteTarget,
    setDeleteTarget,
    refreshList,
  } = state;

  const toggleMenuActive = async () => {
    const prev = menu.is_active;
    setMenu((m) => ({ ...m, is_active: !m.is_active }));
    try {
      const result = await actionUpdateMenu(tenantId, {
        id: menu.id,
        is_active: !prev,
      });
      if (result.error) {
        setMenu((m) => ({ ...m, is_active: prev }));
        toast({ title: result.error, variant: 'destructive' });
      }
    } catch {
      setMenu((m) => ({ ...m, is_active: prev }));
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  // --- Category CRUD --------------------------------------

  const openNewCategoryModal = () => {
    setEditingCategory(null);
    setCatName('');
    setCatNameEn('');
    setCatOrder(categories.length);
    setShowCategoryModal(true);
  };

  const openEditCategoryModal = (cat: Category) => {
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatNameEn(cat.name_en || '');
    setCatOrder(cat.display_order || 0);
    setShowCategoryModal(true);
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setSavingCategory(true);
    try {
      const payload = {
        name: catName.trim(),
        name_en: catNameEn.trim() || null,
        display_order: Number(catOrder) || 0,
        tenant_id: tenantId,
        menu_id: menu.id,
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
      setShowCategoryModal(false);
      refreshList();
    } catch {
      toast({ title: t('saveError'), variant: 'destructive' });
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = (cat: Category) => {
    const catItems = items.filter((it) => it.category_id === cat.id);
    if (catItems.length > 0) {
      toast({
        title: tCat('categoryHasDishes', { count: catItems.length }),
        variant: 'destructive',
      });
      return;
    }
    setDeleteTarget({ id: cat.id, name: cat.name });
  };

  const confirmDeleteCategory = async () => {
    if (!deleteTarget) return;
    try {
      const result = await actionDeleteCategory(tenantId, deleteTarget.id);
      if (result.error) {
        toast({ title: result.error, variant: 'destructive' });
        return;
      }
      toast({ title: t('categoryDeleted') });
      refreshList();
    } catch {
      toast({ title: t('deleteError'), variant: 'destructive' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const toggleCategoryActive = async (cat: Category) => {
    const newValue = !(cat.is_active ?? true);
    // Optimistic update
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, is_active: newValue } : c)));
    const result = await actionToggleCategoryActive(tenantId, cat.id, newValue);
    if (result.error) {
      // Rollback
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, is_active: cat.is_active } : c)),
      );
      toast({ title: result.error, variant: 'destructive' });
    } else {
      toast({
        title: newValue ? t('categoryVisible') : t('categoryHidden'),
      });
    }
  };

  // --- Assign existing category -------------------------

  const handleAssignCategory = async (cat: Category) => {
    setAssigningCategory(true);
    try {
      const result = await actionAssignCategoryToMenu(tenantId, cat.id, menu.id);
      if (result.error) {
        toast({ title: result.error, variant: 'destructive' });
        return;
      }
      toast({ title: t('categoryAssigned') });
      setShowAssignDropdown(false);
      revalidateMenuCache();
      refreshList();
    } catch {
      toast({ title: t('saveError'), variant: 'destructive' });
    } finally {
      setAssigningCategory(false);
    }
  };

  // --- Item operations (optimistic) -----------------------

  const toggleItemAvailable = async (item: MenuItem) => {
    const newValue = !item.is_available;
    // Optimistic update
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_available: newValue } : i)));
    try {
      const result = await actionToggleMenuItemAvailable(tenantId, item.id, newValue);
      if (result.error) {
        // Rollback
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, is_available: item.is_available } : i)),
        );
        toast({ title: result.error, variant: 'destructive' });
      }
    } catch {
      // Rollback
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_available: item.is_available } : i)),
      );
      toast({ title: tc('error'), variant: 'destructive' });
    }
  };

  // --- Inline price editing ------------------------------

  const startEditingPrice = (item: MenuItem) => {
    setEditingPriceId(item.id);
    setEditingPriceValue(String(item.price));
    setTimeout(() => priceInputRef.current?.select(), 0);
  };

  const saveInlinePrice = async (item: MenuItem) => {
    const newPrice = parseInt(editingPriceValue, 10);
    setEditingPriceId(null);
    if (isNaN(newPrice) || newPrice < 0 || newPrice === item.price) return;

    // Optimistic update
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, price: newPrice } : i)));
    try {
      const result = await actionUpdateMenuItemPrice(tenantId, item.id, newPrice);
      if (result.error) {
        // Rollback
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, price: item.price } : i)));
        toast({ title: result.error, variant: 'destructive' });
      } else {
        toast({ title: t('itemSaved') });
      }
    } catch {
      // Rollback
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, price: item.price } : i)));
      toast({ title: t('itemSaveError'), variant: 'destructive' });
    }
  };

  // --- Item edit modal -----------------------------------

  const openEditItemModal = (item: MenuItem) => {
    setEditingItem(item);
    setItemFormName(item.name);
    setItemFormDescription(item.description || '');
    setItemFormPrice(item.price);
    setItemFormAvailable(item.is_available);
    setItemFormImageUrl(item.image_url || '');
  };

  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !itemFormName.trim()) return;
    setSavingItem(true);
    try {
      const payload = {
        name: itemFormName.trim(),
        description: itemFormDescription.trim() || undefined,
        price: Number(itemFormPrice) || 0,
        is_available: itemFormAvailable,
        image_url: itemFormImageUrl || null,
      };
      const result = await actionUpdateMenuItem(tenantId, editingItem.id, payload);
      if (result.error) {
        toast({ title: result.error, variant: 'destructive' });
        return;
      }

      // Optimistic update
      setItems((prev) =>
        prev.map((i) =>
          i.id === editingItem.id
            ? {
                ...i,
                name: payload.name,
                description: payload.description,
                price: payload.price,
                is_available: payload.is_available,
                image_url: payload.image_url ?? undefined,
              }
            : i,
        ),
      );
      toast({ title: t('itemSaved') });
      setEditingItem(null);
    } catch {
      toast({ title: t('itemSaveError'), variant: 'destructive' });
    } finally {
      setSavingItem(false);
    }
  };

  return {
    toggleMenuActive,
    openNewCategoryModal,
    openEditCategoryModal,
    handleCategorySubmit,
    handleDeleteCategory,
    confirmDeleteCategory,
    toggleCategoryActive,
    handleAssignCategory,
    toggleItemAvailable,
    startEditingPrice,
    saveInlinePrice,
    openEditItemModal,
    handleItemSubmit,
  };
}
