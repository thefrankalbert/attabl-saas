'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AdminModal from '@/components/admin/AdminModal';
import { INGREDIENT_UNITS, MOVEMENT_TYPE_LABELS } from '@/types/inventory.types';
import type { Ingredient, MovementType } from '@/types/inventory.types';
import type { Supplier } from '@/types/supplier.types';

interface InventoryAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIngredient: Ingredient | null;
  adjustType: MovementType;
  setAdjustType: Dispatch<SetStateAction<MovementType>>;
  adjustQty: string;
  setAdjustQty: Dispatch<SetStateAction<string>>;
  adjustNotes: string;
  setAdjustNotes: Dispatch<SetStateAction<string>>;
  adjustSupplierId: string;
  setAdjustSupplierId: Dispatch<SetStateAction<string>>;
  activeSuppliers: Supplier[];
  isSubmitting: boolean;
  handleAdjust: () => void;
}

export default function InventoryAdjustModal({
  isOpen,
  onClose,
  selectedIngredient,
  adjustType,
  setAdjustType,
  adjustQty,
  setAdjustQty,
  adjustNotes,
  setAdjustNotes,
  adjustSupplierId,
  setAdjustSupplierId,
  activeSuppliers,
  isSubmitting,
  handleAdjust,
}: InventoryAdjustModalProps) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  return (
    <AdminModal isOpen={isOpen} onClose={onClose} title={t('adjustStock')} size="lg">
      {selectedIngredient && (
        <>
          <p className="text-sm text-app-text-secondary mb-4">
            {selectedIngredient.name} - {t('currentStock')} :{' '}
            <span className="font-bold">
              {selectedIngredient.current_stock}{' '}
              {INGREDIENT_UNITS[selectedIngredient.unit]?.labelShort}
            </span>
          </p>

          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                {t('movementType')}
              </Label>
              <Select
                value={adjustType}
                onValueChange={(val) => setAdjustType(val as MovementType)}
              >
                <SelectTrigger className="w-full h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['manual_add', 'manual_remove', 'adjustment', 'opening'] as MovementType[]).map(
                    (mt) => (
                      <SelectItem key={mt} value={mt}>
                        {MOVEMENT_TYPE_LABELS[mt].label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                {tc('quantity')}
              </Label>
              <Input
                type="number"
                step="0.01"
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>

            {adjustType === 'manual_add' && activeSuppliers.length > 0 && (
              <div>
                <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                  {t('supplierOptional')}
                </Label>
                <Select
                  value={adjustSupplierId || '__none__'}
                  onValueChange={(val) => setAdjustSupplierId(val === '__none__' ? '' : val)}
                >
                  <SelectTrigger className="w-full h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__"> - {tc('none')} - </SelectItem>
                    {activeSuppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                {t('notesOptional')}
              </Label>
              <Input
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
                placeholder={t('adjustReasonPlaceholder')}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="ghost" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleAdjust} disabled={!adjustQty || isSubmitting} variant="default">
              {tc('confirm')}
            </Button>
          </div>
        </>
      )}
    </AdminModal>
  );
}
