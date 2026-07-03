'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { useTranslations } from 'next-intl';
import {
  actionCreateIngredient,
  actionUpdateIngredient,
  actionAdjustStock,
  actionReceiveStock,
  actionRecordLoss,
} from '@/app/actions/inventory';
import type {
  Ingredient,
  IngredientUnit,
  CreateIngredientInput,
  MovementType,
  LossReasonCode,
} from '@/types/inventory.types';
import type { ModalMode } from './InventoryFormModal';

export function useInventoryActions(tenantId: string) {
  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formUnit, setFormUnit] = useState<IngredientUnit>('kg');
  const [formStock, setFormStock] = useState('');
  const [formMinAlert, setFormMinAlert] = useState('');
  const [formCostPerUnit, setFormCostPerUnit] = useState('');
  const [formCategory, setFormCategory] = useState('');
  // Purchase-unit conversion config (#15). Empty label = bought in base unit.
  const [formPurchaseUnit, setFormPurchaseUnit] = useState('');
  const [formUnitsPerPurchase, setFormUnitsPerPurchase] = useState('1');

  // Adjust stock fields
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<MovementType>('manual_add');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustSupplierId, setAdjustSupplierId] = useState('');
  // When receiving a manual_add on an ingredient that has a purchase_unit, the
  // quantity can be entered in the base unit ('base') or the purchase unit
  // ('purchase'); 'purchase' routes to actionReceiveStock (server converts).
  const [receiveUnitMode, setReceiveUnitMode] = useState<'base' | 'purchase'>('base');

  // Loss declaration fields
  const [lossQty, setLossQty] = useState('');
  const [lossReason, setLossReason] = useState<LossReasonCode>('breakage');
  const [lossNotes, setLossNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const { toast } = useToast();
  const t = useTranslations('inventory');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();

  const resetForm = () => {
    setFormName('');
    setFormUnit('kg');
    setFormStock('');
    setFormMinAlert('');
    setFormCostPerUnit('');
    setFormCategory('');
    setFormPurchaseUnit('');
    setFormUnitsPerPurchase('1');
    setAdjustQty('');
    setAdjustType('manual_add');
    setAdjustNotes('');
    setAdjustSupplierId('');
    setReceiveUnitMode('base');
    setLossQty('');
    setLossReason('breakage');
    setLossNotes('');
    setSelectedIngredient(null);
    setConfirmDeactivate(false);
  };

  const openAdd = () => {
    resetForm();
    setModalMode('add');
  };

  const openEdit = (ing: Ingredient) => {
    setSelectedIngredient(ing);
    setFormName(ing.name);
    setFormUnit(ing.unit);
    setFormMinAlert(String(ing.min_stock_alert));
    setFormCostPerUnit(String(ing.cost_per_unit));
    setFormCategory(ing.category || '');
    setFormPurchaseUnit(ing.purchase_unit || '');
    setFormUnitsPerPurchase(String(ing.units_per_purchase ?? 1));
    setModalMode('edit');
  };

  const openAdjust = (ing: Ingredient) => {
    setSelectedIngredient(ing);
    setAdjustQty('');
    setAdjustType('manual_add');
    setAdjustNotes('');
    setReceiveUnitMode('base');
    setModalMode('adjust');
  };

  const openLoss = (ing: Ingredient) => {
    setSelectedIngredient(ing);
    setLossQty('');
    setLossReason('breakage');
    setLossNotes('');
    setModalMode('loss');
  };

  const closeModal = () => {
    setModalMode(null);
    resetForm();
  };

  const handleSave = async () => {
    if (isSubmitting) return;
    if (!formName.trim()) {
      toast({ title: t('nameRequired'), variant: 'destructive' });
      return;
    }

    // Purchase-unit config (#15): empty label = bought in base unit (identity).
    const purchaseUnit = formPurchaseUnit.trim() || null;
    const parsedUpp = parseFloat(formUnitsPerPurchase);
    const unitsPerPurchase = Number.isFinite(parsedUpp) && parsedUpp > 0 ? parsedUpp : 1;

    setIsSubmitting(true);
    try {
      if (modalMode === 'add') {
        const input: CreateIngredientInput = {
          name: formName.trim(),
          unit: formUnit,
          current_stock: parseFloat(formStock) || 0,
          min_stock_alert: parseFloat(formMinAlert) || 0,
          cost_per_unit: parseFloat(formCostPerUnit) || 0,
          category: formCategory.trim() || undefined,
          purchase_unit: purchaseUnit,
          units_per_purchase: unitsPerPurchase,
        };
        const r = await actionCreateIngredient(tenantId, input);
        if (r.error) throw new Error(r.error);
        toast({ title: t('productAdded') });
      } else if (modalMode === 'edit' && selectedIngredient) {
        const r = await actionUpdateIngredient(tenantId, selectedIngredient.id, {
          name: formName.trim(),
          unit: formUnit,
          min_stock_alert: parseFloat(formMinAlert) || 0,
          cost_per_unit: parseFloat(formCostPerUnit) || 0,
          category: formCategory.trim() || null,
          purchase_unit: purchaseUnit,
          units_per_purchase: unitsPerPurchase,
        });
        if (r.error) throw new Error(r.error);
        toast({ title: t('productUpdated') });
      }
      setModalMode(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['ingredients', tenantId] });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (isSubmitting || !selectedIngredient) return;

    setIsSubmitting(true);
    try {
      const r = await actionUpdateIngredient(tenantId, selectedIngredient.id, {
        is_active: false,
      });
      if (r.error) throw new Error(r.error);
      toast({ title: tc('deletedSuccess') });
      setModalMode(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['ingredients', tenantId] });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjust = async () => {
    if (isSubmitting) return;
    if (!selectedIngredient || !adjustQty) return;

    // Receiving in the purchase unit routes to actionReceiveStock, which
    // converts to the base unit server-side before the ledger write. Only
    // manual_add on an ingredient that has a purchase_unit offers this mode.
    const isPurchaseReceipt =
      adjustType === 'manual_add' &&
      !!selectedIngredient.purchase_unit &&
      receiveUnitMode === 'purchase';

    setIsSubmitting(true);
    try {
      const r = isPurchaseReceipt
        ? await actionReceiveStock(tenantId, {
            ingredient_id: selectedIngredient.id,
            quantity: parseFloat(adjustQty),
            inPurchaseUnit: true,
            supplier_id: adjustSupplierId || undefined,
            notes: adjustNotes.trim() || undefined,
          })
        : await actionAdjustStock(tenantId, {
            ingredient_id: selectedIngredient.id,
            quantity: parseFloat(adjustQty),
            movement_type: adjustType,
            notes: adjustNotes.trim() || undefined,
            supplier_id: adjustSupplierId || undefined,
          });
      if (r.error) throw new Error(r.error);
      toast({ title: t('stockAdjusted') });
      setModalMode(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['ingredients', tenantId] });
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordLoss = async () => {
    if (isSubmitting) return;
    if (!selectedIngredient || !lossQty) return;

    setIsSubmitting(true);
    try {
      const r = await actionRecordLoss(tenantId, {
        ingredient_id: selectedIngredient.id,
        quantity: parseFloat(lossQty),
        reason_code: lossReason,
        notes: lossNotes.trim() || undefined,
      });
      if (r.error) {
        toast({ title: t('lossError'), description: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: t('lossRecorded') });
      setModalMode(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['ingredients', tenantId] });
    } catch {
      toast({ title: t('lossError'), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    modalMode,
    selectedIngredient,
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
    formPurchaseUnit,
    setFormPurchaseUnit,
    formUnitsPerPurchase,
    setFormUnitsPerPurchase,
    adjustQty,
    setAdjustQty,
    adjustType,
    setAdjustType,
    adjustNotes,
    setAdjustNotes,
    adjustSupplierId,
    setAdjustSupplierId,
    receiveUnitMode,
    setReceiveUnitMode,
    lossQty,
    setLossQty,
    lossReason,
    setLossReason,
    lossNotes,
    setLossNotes,
    isSubmitting,
    confirmDeactivate,
    setConfirmDeactivate,
    openAdd,
    openEdit,
    openAdjust,
    openLoss,
    closeModal,
    handleSave,
    handleDeactivate,
    handleAdjust,
    handleRecordLoss,
  };
}
