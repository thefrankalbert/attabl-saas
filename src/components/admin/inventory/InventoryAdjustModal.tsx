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
import { convertToBaseUnit } from '@/lib/inventory/unit-conversion';

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
  receiveUnitMode: 'base' | 'purchase';
  setReceiveUnitMode: Dispatch<SetStateAction<'base' | 'purchase'>>;
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
  receiveUnitMode,
  setReceiveUnitMode,
  activeSuppliers,
  isSubmitting,
  handleAdjust,
}: InventoryAdjustModalProps) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');

  // Only manual_add on an ingredient with a purchase_unit offers the unit choice.
  const canReceiveInPurchaseUnit =
    adjustType === 'manual_add' && !!selectedIngredient?.purchase_unit;
  const baseUnitShort = selectedIngredient
    ? (INGREDIENT_UNITS[selectedIngredient.unit]?.labelShort ?? selectedIngredient.unit)
    : '';

  // Live preview of the converted base-unit quantity when receiving in the
  // purchase unit. convertToBaseUnit throws on qty < 0 or unitsPerPurchase <= 0
  // (unreachable given the NOT NULL DEFAULT 1 + CHECK > 0, but guard the render
  // path anyway - never throw during render). Show nothing until inputs are valid.
  let convertedHint: string | null = null;
  if (
    canReceiveInPurchaseUnit &&
    receiveUnitMode === 'purchase' &&
    selectedIngredient &&
    adjustQty.trim() !== ''
  ) {
    const qty = parseFloat(adjustQty);
    const unitsPerPurchase = Number(selectedIngredient.units_per_purchase);
    if (Number.isFinite(qty) && qty >= 0 && unitsPerPurchase > 0) {
      const converted = convertToBaseUnit({
        quantity: qty,
        baseUnit: selectedIngredient.unit,
        purchaseUnit: selectedIngredient.purchase_unit,
        unitsPerPurchase,
      });
      convertedHint = t('convertedTo', { qty: converted, unit: baseUnitShort });
    }
  }
  return (
    <AdminModal
      isOpen={isOpen}
      onClose={onClose}
      title={canReceiveInPurchaseUnit ? t('receiveStock') : t('adjustStock')}
      size="lg"
    >
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

            {canReceiveInPurchaseUnit && selectedIngredient && (
              <div>
                <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                  {t('enterIn')}
                </Label>
                <Select
                  value={receiveUnitMode}
                  onValueChange={(val) => setReceiveUnitMode(val as 'base' | 'purchase')}
                >
                  <SelectTrigger className="w-full h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="base">
                      {t('enterInBaseUnit', { unit: baseUnitShort })}
                    </SelectItem>
                    <SelectItem value="purchase">
                      {t('enterInPurchaseUnit', { unit: selectedIngredient.purchase_unit ?? '' })}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

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
              {convertedHint && <p className="text-xs text-app-text-muted mt-1">{convertedHint}</p>}
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
