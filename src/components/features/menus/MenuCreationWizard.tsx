'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Check, FolderPlus } from 'lucide-react';
import AdminModal from '@/components/admin/AdminModal';
import MenuForm from '@/components/features/menus/MenuForm';
import WizardStepCategories from '@/components/features/menus/WizardStepCategories';
import WizardStepItems from '@/components/features/menus/WizardStepItems';
import { Button } from '@/components/ui/button';
import type { MenuFormData } from '@/hooks/useMenusData';
import type { Menu, Venue, Category, CurrencyCode, WizardItem } from '@/types/admin.types';

type WizardStep = 'menu' | 'confirm' | 'categories' | 'items';

interface MenuCreationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  menus: Menu[];
  venues: Venue[];
  currency: CurrencyCode;
  onCreateMenu: (data: MenuFormData) => Promise<Menu | null>;
  onComplete: () => void;
}

export default function MenuCreationWizard({
  isOpen,
  onClose,
  tenantId,
  menus,
  venues,
  currency,
  onCreateMenu,
  onComplete,
}: MenuCreationWizardProps) {
  const t = useTranslations('menus');

  const [step, setStep] = useState<WizardStep>('menu');
  const [createdMenu, setCreatedMenu] = useState<Menu | null>(null);
  const [createdCategories, setCreatedCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [categoryItems, setCategoryItems] = useState<Record<string, WizardItem[]>>({});

  // ─── Reset ─────────────────────────────────────────────

  const reset = useCallback(() => {
    setStep('menu');
    setCreatedMenu(null);
    setCreatedCategories([]);
    setActiveCategory(null);
    setCategoryItems({});
  }, []);

  const handleClose = useCallback(() => {
    onComplete();
    reset();
    onClose();
  }, [onClose, onComplete, reset]);

  // ─── Step 1: Menu form submit ──────────────────────────

  const handleMenuSubmit = async (data: MenuFormData) => {
    const menu = await onCreateMenu(data);
    if (menu) {
      setCreatedMenu(menu);
      setStep('confirm');
    }
  };

  // ─── Step 2 confirm → categories ──────────────────────

  const goToCategories = () => setStep('categories');

  // ─── Category created callback ─────────────────────────

  const handleCategoryCreated = (category: Category) => {
    setCreatedCategories((prev) => [...prev, category]);
  };

  // ─── Go to items for a category ────────────────────────

  const handleAddItems = (category: Category) => {
    setActiveCategory(category);
    setStep('items');
  };

  // ─── Item created callback ─────────────────────────────

  const handleItemCreated = (item: WizardItem) => {
    if (!activeCategory) return;
    setCategoryItems((prev) => ({
      ...prev,
      [activeCategory.id]: [...(prev[activeCategory.id] || []), item],
    }));
  };

  // ─── Back to categories from items ─────────────────────

  const handleBackToCategories = () => {
    setActiveCategory(null);
    setStep('categories');
  };

  // ─── Dynamic title ─────────────────────────────────────

  const getTitle = (): string => {
    switch (step) {
      case 'menu':
        return t('newMenuTitle');
      case 'confirm':
        return t('menuCreated');
      case 'categories':
        return t('wizardAddCategories');
      case 'items':
        return t('wizardAddItems');
    }
  };

  return (
    <AdminModal isOpen={isOpen} onClose={handleClose} title={getTitle()} size="lg">
      {isOpen && (
        <>
          {/* Step 1: Menu form */}
          {step === 'menu' && (
            <MenuForm
              key="wizard-new"
              editingMenu={null}
              menus={menus}
              venues={venues}
              onSubmit={handleMenuSubmit}
              onCancel={handleClose}
            />
          )}

          {/* Step 1.5: Confirmation - add categories? */}
          {step === 'confirm' && createdMenu && (
            <div className="py-8 text-center space-y-6">
              <div className="w-14 h-14 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto">
                <Check className="w-7 h-7 text-accent" />
              </div>
              <div>
                <p className="text-base font-bold text-app-text">
                  {t('wizardMenuCreatedMessage', { name: createdMenu.name })}
                </p>
                <p className="text-sm text-app-text-secondary mt-1">
                  {t('wizardAddCategoriesPrompt')}
                </p>
              </div>
              <div className="flex justify-center gap-3">
                <Button variant="ghost" onClick={handleClose}>
                  {t('wizardFinish')}
                </Button>
                <Button variant="default" onClick={goToCategories} className="gap-1.5">
                  <FolderPlus className="w-4 h-4" />
                  {t('wizardAddCategories')}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Categories */}
          {step === 'categories' && createdMenu && (
            <WizardStepCategories
              menu={createdMenu}
              tenantId={tenantId}
              categories={createdCategories}
              onCategoryCreated={handleCategoryCreated}
              onAddItems={handleAddItems}
              onFinish={handleClose}
            />
          )}

          {/* Step 3: Items */}
          {step === 'items' && createdMenu && activeCategory && (
            <WizardStepItems
              menu={createdMenu}
              category={activeCategory}
              tenantId={tenantId}
              currency={currency}
              items={categoryItems[activeCategory.id] || []}
              onItemCreated={handleItemCreated}
              onBack={handleBackToCategories}
              onFinish={handleClose}
            />
          )}
        </>
      )}
    </AdminModal>
  );
}
