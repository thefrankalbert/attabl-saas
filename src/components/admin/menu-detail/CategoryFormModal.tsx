'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AdminModal from '@/components/admin/AdminModal';
import type { MenuDetailVM } from './use-menu-detail';

interface Props {
  vm: MenuDetailVM;
}

export function CategoryFormModal({ vm }: Props) {
  const {
    t,
    showCategoryModal,
    setShowCategoryModal,
    editingCategory,
    handleCategorySubmit,
    catName,
    setCatName,
    catOrder,
    setCatOrder,
    savingCategory,
  } = vm;

  return (
    <AdminModal
      isOpen={showCategoryModal}
      onClose={() => setShowCategoryModal(false)}
      title={editingCategory ? t('editCategoryTitle') : t('newCategoryTitle')}
    >
      <form onSubmit={handleCategorySubmit} className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label htmlFor="cat-name">{t('categoryNameFr')}</Label>
          <Input
            id="cat-name"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            placeholder={t('nameFrPlaceholder')}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cat-order">{t('categoryDisplayOrder')}</Label>
          <Input
            id="cat-order"
            type="number"
            value={catOrder}
            onChange={(e) => setCatOrder(e.target.value === '' ? '' : Number(e.target.value))}
            min={0}
          />
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
          <Button type="button" variant="outline" onClick={() => setShowCategoryModal(false)}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={savingCategory}>
            {savingCategory && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editingCategory ? t('update') : t('create')}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
