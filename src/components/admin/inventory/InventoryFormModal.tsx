'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
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
import { INGREDIENT_UNITS } from '@/types/inventory.types';
import type { IngredientUnit, INGREDIENT_UNITS as UNITS_TYPE } from '@/types/inventory.types';

export type ModalMode = 'add' | 'edit' | 'adjust' | null;

interface InventoryFormModalProps {
  isOpen: boolean;
  mode: ModalMode;
  onClose: () => void;
  formName: string;
  setFormName: Dispatch<SetStateAction<string>>;
  formUnit: IngredientUnit;
  setFormUnit: Dispatch<SetStateAction<IngredientUnit>>;
  formStock: string;
  setFormStock: Dispatch<SetStateAction<string>>;
  formMinAlert: string;
  setFormMinAlert: Dispatch<SetStateAction<string>>;
  formCostPerUnit: string;
  setFormCostPerUnit: Dispatch<SetStateAction<string>>;
  formCategory: string;
  setFormCategory: Dispatch<SetStateAction<string>>;
  confirmDeactivate: boolean;
  setConfirmDeactivate: Dispatch<SetStateAction<boolean>>;
  isSubmitting: boolean;
  handleSave: () => void;
  handleDeactivate: () => void;
}

export default function InventoryFormModal({
  isOpen,
  mode,
  onClose,
  formName,
  setFormName,
  formUnit,
  setFormUnit,
  formStock,
  setFormStock,
  formMinAlert,
  setFormMinAlert,
  formCostPerUnit,
  setFormCostPerUnit,
  formCategory,
  setFormCategory,
  confirmDeactivate,
  setConfirmDeactivate,
  isSubmitting,
  handleSave,
  handleDeactivate,
}: InventoryFormModalProps) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  return (
    <AdminModal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'add' ? t('addIngredient') : t('editIngredient')}
      size="lg"
    >
      <div className="space-y-4">
        <div>
          <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
            {tc('name')}
          </Label>
          <Input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder={t('ingredientNamePlaceholder')}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
              {tc('unit')}
            </Label>
            <Select value={formUnit} onValueChange={(val) => setFormUnit(val as IngredientUnit)}>
              <SelectTrigger className="w-full h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(INGREDIENT_UNITS) as IngredientUnit[]).map((u) => (
                  <SelectItem key={u} value={u}>
                    {(INGREDIENT_UNITS as typeof UNITS_TYPE)[u].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {mode === 'add' && (
            <div>
              <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                {t('currentStock')}
              </Label>
              <Input
                type="number"
                step="0.01"
                value={formStock}
                onChange={(e) => setFormStock(e.target.value)}
                placeholder="0"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
              {t('minAlert')}
            </Label>
            <Input
              type="number"
              step="0.01"
              value={formMinAlert}
              onChange={(e) => setFormMinAlert(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
              {t('costPerUnit')}
            </Label>
            <Input
              type="number"
              step="0.01"
              value={formCostPerUnit}
              onChange={(e) => setFormCostPerUnit(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
            {t('categoryOptional')}
          </Label>
          <Input
            value={formCategory}
            onChange={(e) => setFormCategory(e.target.value)}
            placeholder={t('categoryPlaceholder')}
          />
        </div>
      </div>

      <div className="flex justify-between gap-2 mt-6">
        <div>
          {mode === 'edit' &&
            (confirmDeactivate ? (
              <div className="flex gap-2">
                <Button variant="destructive" onClick={handleDeactivate} disabled={isSubmitting}>
                  {tc('confirm')}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDeactivate(false)}>
                  {tc('cancel')}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                onClick={() => setConfirmDeactivate(true)}
                className="text-status-error hover:text-status-error gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {tc('delete')}
              </Button>
            ))}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting} variant="default">
            {tc('save')}
          </Button>
        </div>
      </div>
    </AdminModal>
  );
}
