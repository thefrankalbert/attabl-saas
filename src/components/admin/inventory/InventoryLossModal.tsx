'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AdminModal from '@/components/admin/AdminModal';
import { INGREDIENT_UNITS, LOSS_REASONS } from '@/types/inventory.types';
import type { Ingredient, LossReasonCode } from '@/types/inventory.types';

interface InventoryLossModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIngredient: Ingredient | null;
  lossReason: LossReasonCode;
  setLossReason: Dispatch<SetStateAction<LossReasonCode>>;
  lossQty: string;
  setLossQty: Dispatch<SetStateAction<string>>;
  lossNotes: string;
  setLossNotes: Dispatch<SetStateAction<string>>;
  isSubmitting: boolean;
  handleRecordLoss: () => void;
}

export default function InventoryLossModal({
  isOpen,
  onClose,
  selectedIngredient,
  lossReason,
  setLossReason,
  lossQty,
  setLossQty,
  lossNotes,
  setLossNotes,
  isSubmitting,
  handleRecordLoss,
}: InventoryLossModalProps) {
  const t = useTranslations('inventory');
  const tl = useTranslations('losses');
  const tc = useTranslations('common');
  return (
    <AdminModal isOpen={isOpen} onClose={onClose} title={t('declareLoss')} size="lg">
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
                {t('lossReason')}
              </Label>
              <Select
                value={lossReason}
                onValueChange={(val) => setLossReason(val as LossReasonCode)}
              >
                <SelectTrigger className="w-full h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOSS_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {tl(`reason_${reason}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                {t('lossQty')}
              </Label>
              <Input
                type="number"
                step="0.01"
                value={lossQty}
                onChange={(e) => setLossQty(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
                {t('lossNotes')}
              </Label>
              <Textarea
                value={lossNotes}
                onChange={(e) => setLossNotes(e.target.value)}
                placeholder={t('notesOptional')}
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="ghost" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button
              onClick={handleRecordLoss}
              disabled={!lossQty || isSubmitting}
              variant="default"
            >
              {tc('confirm')}
            </Button>
          </div>
        </>
      )}
    </AdminModal>
  );
}
