'use client';

import { Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import AdminModal from '@/components/admin/AdminModal';
import ImageUpload from '@/components/shared/ImageUpload';
import { cn } from '@/lib/utils';
import type { MenuDetailVM } from './use-menu-detail';

interface Props {
  vm: MenuDetailVM;
}

export function ItemEditModal({ vm }: Props) {
  const {
    t,
    editingItem,
    setEditingItem,
    handleItemSubmit,
    itemFormName,
    setItemFormName,
    itemFormDescription,
    setItemFormDescription,
    itemFormPrice,
    setItemFormPrice,
    itemFormImageUrl,
    setItemFormImageUrl,
    itemFormAvailable,
    setItemFormAvailable,
    savingItem,
  } = vm;

  return (
    <AdminModal
      isOpen={!!editingItem}
      onClose={() => setEditingItem(null)}
      title={t('editItemTitle')}
    >
      {editingItem && (
        <form onSubmit={handleItemSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="item-name">{t('itemName')}</Label>
            <Input
              id="item-name"
              value={itemFormName}
              onChange={(e) => setItemFormName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-desc">{t('itemDescription')}</Label>
            <Textarea
              id="item-desc"
              value={itemFormDescription}
              onChange={(e) => setItemFormDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-price">{t('itemPrice')}</Label>
            <Input
              id="item-price"
              type="number"
              value={itemFormPrice}
              onChange={(e) =>
                setItemFormPrice(e.target.value === '' ? '' : Number(e.target.value))
              }
              min={0}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('itemPhoto')}</Label>
            <ImageUpload
              value={itemFormImageUrl}
              onChange={(url) => setItemFormImageUrl(url)}
              onRemove={() => setItemFormImageUrl('')}
              bucket="menu-items"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setItemFormAvailable(!itemFormAvailable)}
              className={cn(
                'px-3 py-1.5 rounded-[0.625rem] text-xs font-medium h-auto',
                itemFormAvailable
                  ? 'border border-[var(--border)] text-[var(--success)]'
                  : 'bg-app-bg text-app-text-secondary border-app-border',
              )}
            >
              {itemFormAvailable ? (
                <>
                  <Check className="w-3 h-3 inline mr-1" />
                  {t('itemInStock')}
                </>
              ) : (
                <>
                  <X className="w-3 h-3 inline mr-1" />
                  {t('exhaustedLabel')}
                </>
              )}
            </Button>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
            <Button type="button" variant="outline" onClick={() => setEditingItem(null)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={savingItem}>
              {savingItem && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('update')}
            </Button>
          </div>
        </form>
      )}
    </AdminModal>
  );
}
