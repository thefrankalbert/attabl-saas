'use client';

import { useState, useCallback, useRef, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSessionState } from '@/hooks/useSessionState';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import type { Menu, Category, MenuItem } from '@/types/admin.types';
import type { ServerListPagination } from '@/lib/pagination';

export interface MenuDetailClientProps {
  tenantId: string;
  tenantSlug: string;
  menu: Menu;
  categories: Category[];
  availableCategories: Category[];
  items: MenuItem[];
  categoryPagination: ServerListPagination;
}

export function useMenuDetailState({
  tenantId,
  tenantSlug,
  menu: initialMenu,
  categories: initialCategories,
  availableCategories: initialAvailableCategories,
  items: initialItems,
  categoryPagination,
}: MenuDetailClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [menu, setMenu] = useState<Menu>(initialMenu);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [availableCategories, setAvailableCategories] = useState<Category[]>(
    initialAvailableCategories,
  );
  const [items, setItems] = useState<MenuItem[]>(initialItems);
  const [serverBundleKey, setServerBundleKey] = useState({
    menu: initialMenu,
    categories: initialCategories,
    availableCategories: initialAvailableCategories,
    items: initialItems,
  });
  if (
    initialMenu !== serverBundleKey.menu ||
    initialCategories !== serverBundleKey.categories ||
    initialAvailableCategories !== serverBundleKey.availableCategories ||
    initialItems !== serverBundleKey.items
  ) {
    setServerBundleKey({
      menu: initialMenu,
      categories: initialCategories,
      availableCategories: initialAvailableCategories,
      items: initialItems,
    });
    setMenu(initialMenu);
    setCategories(initialCategories);
    setAvailableCategories(initialAvailableCategories);
    setItems(initialItems);
  }
  const [expandedCategories, setExpandedCategories] = useSessionState<Set<string>>(
    'menuDetail:expandedCategories',
    new Set(),
  );

  // Assign existing category state
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [assigningCategory, setAssigningCategory] = useState(false);

  // Category modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catNameEn, setCatNameEn] = useState('');
  const [catOrder, setCatOrder] = useState<number | string>(0);
  const [savingCategory, setSavingCategory] = useState(false);

  // Item edit modal state
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemFormName, setItemFormName] = useState('');
  const [itemFormDescription, setItemFormDescription] = useState('');
  const [itemFormPrice, setItemFormPrice] = useState<number | string>(0);
  const [itemFormAvailable, setItemFormAvailable] = useState(true);
  const [itemFormImageUrl, setItemFormImageUrl] = useState('');
  const [savingItem, setSavingItem] = useState(false);

  // Inline price editing state
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');
  const priceInputRef = useRef<HTMLInputElement>(null);

  // Modifier editor state
  const [editingModifiersItem, setEditingModifiersItem] = useState<MenuItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { toast } = useToast();
  const t = useTranslations('menus');
  const tc = useTranslations('common');
  const tCat = useTranslations('categories');

  const { pageSize, total: totalCategories } = categoryPagination;
  const maxCategoryPage = Math.max(0, Math.ceil(totalCategories / pageSize) - 1);
  const effectiveCategoryPage = Math.min(categoryPagination.page - 1, maxCategoryPage);

  const handleCategoryPageChange = useCallback(
    (page: number) => {
      const params = new URLSearchParams();
      if (page > 0) {
        params.set('page', String(page + 1));
      }
      const qs = params.toString();
      startRefreshTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [router, pathname],
  );

  const refreshList = useCallback(() => {
    startRefreshTransition(() => {
      router.refresh();
    });
  }, [router]);

  const getItemsForCategory = (categoryId: string) =>
    items.filter((item) => item.category_id === categoryId);

  return {
    tenantId,
    tenantSlug,
    t,
    tc,
    tCat,
    toast,
    isRefreshing,
    menu,
    setMenu,
    categories,
    setCategories,
    availableCategories,
    setAvailableCategories,
    items,
    setItems,
    expandedCategories,
    setExpandedCategories,
    showAssignDropdown,
    setShowAssignDropdown,
    assigningCategory,
    setAssigningCategory,
    showCategoryModal,
    setShowCategoryModal,
    editingCategory,
    setEditingCategory,
    catName,
    setCatName,
    catNameEn,
    setCatNameEn,
    catOrder,
    setCatOrder,
    savingCategory,
    setSavingCategory,
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
    savingItem,
    setSavingItem,
    editingPriceId,
    setEditingPriceId,
    editingPriceValue,
    setEditingPriceValue,
    priceInputRef,
    editingModifiersItem,
    setEditingModifiersItem,
    deleteTarget,
    setDeleteTarget,
    pageSize,
    totalCategories,
    effectiveCategoryPage,
    handleCategoryPageChange,
    refreshList,
    getItemsForCategory,
  };
}

export type MenuDetailState = ReturnType<typeof useMenuDetailState>;
