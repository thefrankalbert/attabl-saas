'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { useTranslations } from 'next-intl';
import {
  actionCreateIngredient,
  actionUpdateIngredient,
  actionAdjustStock,
  actionSetOpeningStock,
  actionReceiveStock,
  actionRecordLoss,
} from '@/app/actions/inventory';
import { MAX_STOCK_QUANTITY, MAX_UNIT_COST } from '@/lib/inventory/quantity-format';
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
  // Optional purchase price of a receipt (manual_add), per ENTERED unit. When
  // set, the server recalculates the product's weighted average cost.
  const [adjustUnitCost, setAdjustUnitCost] = useState('');
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
    setAdjustUnitCost('');
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
    setAdjustUnitCost('');
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

    // Une valeur negative etait refusee par le serveur, mais l'ecran ne
    // montrait que "Erreur", sans dire quoi corriger (audit 2026-11-10, C-043).
    if ([formStock, formMinAlert, formCostPerUnit].some((v) => parseFloat(v) < 0)) {
      toast({ title: t('negativeNotAllowed'), variant: 'destructive' });
      return;
    }

    if (formName.trim().length > 100) {
      toast({ title: t('nameTooLong'), variant: 'destructive' });
      return;
    }

    if (
      [formStock, formMinAlert, formCostPerUnit].some((v) => parseFloat(v) > MAX_STOCK_QUANTITY)
    ) {
      toast({ title: t('quantityTooLarge'), variant: 'destructive' });
      return;
    }

    // Purchase-unit config (#15): empty label = bought in base unit (identity).
    // Un facteur renseigne mais nul ou negatif etait corrige en 1 sans rien dire:
    // on le refuse, le champ vide valant 1.
    const purchaseUnit = formPurchaseUnit.trim() || null;
    const uppRaw = formUnitsPerPurchase.trim();
    const parsedUpp = parseFloat(uppRaw);
    if (uppRaw !== '' && !(Number.isFinite(parsedUpp) && parsedUpp > 0)) {
      toast({ title: t('purchaseFactorInvalid'), variant: 'destructive' });
      return;
    }
    const unitsPerPurchase = uppRaw === '' ? 1 : parsedUpp;

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
    } catch (err) {
      toast({
        title: tc('error'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
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
    } catch (err) {
      toast({
        title: tc('error'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjust = async () => {
    if (isSubmitting) return;
    if (!selectedIngredient || !adjustQty) return;
    const qty = parseFloat(adjustQty);
    // "Stock d'ouverture" fixe le stock a la quantite saisie: 0 est une valeur
    // valide (remise a zero). Pour les autres types, le sens vient du type de
    // mouvement et la quantite est toujours positive.
    const isOpening = adjustType === 'opening';
    if (isOpening ? !(qty >= 0) : !(qty > 0)) {
      toast({
        title: isOpening ? t('openingQuantityInvalid') : t('quantityMustBePositive'),
        variant: 'destructive',
      });
      return;
    }
    if (qty > MAX_STOCK_QUANTITY) {
      toast({ title: t('quantityTooLarge'), variant: 'destructive' });
      return;
    }

    // Purchase price: receipts only, optional. Empty = the cost does not change.
    const unitCostRaw = adjustType === 'manual_add' ? adjustUnitCost.trim() : '';
    const unitCost = unitCostRaw === '' ? undefined : parseFloat(unitCostRaw);
    if (unitCost !== undefined && !(Number.isFinite(unitCost) && unitCost > 0)) {
      toast({ title: t('purchasePriceInvalid'), variant: 'destructive' });
      return;
    }
    if (unitCost !== undefined && unitCost > MAX_UNIT_COST) {
      toast({ title: t('purchasePriceTooLarge'), variant: 'destructive' });
      return;
    }

    // Receiving in the purchase unit routes to actionReceiveStock, which
    // converts to the base unit server-side before the ledger write. Only
    // manual_add on an ingredient that has a purchase_unit offers this mode.
    const isPurchaseReceipt =
      adjustType === 'manual_add' &&
      !!selectedIngredient.purchase_unit &&
      receiveUnitMode === 'purchase';

    setIsSubmitting(true);
    try {
      // "Stock d'ouverture" REMPLACE le stock (10 puis ouverture 5 = 5): il passe
      // par actionSetOpeningStock. actionAdjustStock AJOUTE la quantite au stock.
      const r = isOpening
        ? await actionSetOpeningStock(tenantId, selectedIngredient.id, qty)
        : isPurchaseReceipt
          ? await actionReceiveStock(tenantId, {
              ingredient_id: selectedIngredient.id,
              quantity: qty,
              inPurchaseUnit: true,
              supplier_id: adjustSupplierId || undefined,
              notes: adjustNotes.trim() || undefined,
              unit_cost: unitCost,
            })
          : await actionAdjustStock(tenantId, {
              ingredient_id: selectedIngredient.id,
              quantity: qty,
              movement_type: adjustType,
              notes: adjustNotes.trim() || undefined,
              supplier_id: adjustSupplierId || undefined,
              unit_cost: unitCost,
            });
      if (r.error) throw new Error(r.error);
      toast({ title: t('stockAdjusted') });
      setModalMode(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['ingredients', tenantId] });
    } catch (err) {
      toast({
        title: tc('error'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordLoss = async () => {
    if (isSubmitting) return;
    if (!selectedIngredient || !lossQty) return;
    const lossQuantity = parseFloat(lossQty);
    // Une perte de 0 ou negative ressortait en "Invalid input": on dit quoi corriger.
    if (!(lossQuantity > 0)) {
      toast({ title: t('lossQuantityMustBePositive'), variant: 'destructive' });
      return;
    }
    if (lossQuantity > MAX_STOCK_QUANTITY) {
      toast({ title: t('quantityTooLarge'), variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const r = await actionRecordLoss(tenantId, {
        ingredient_id: selectedIngredient.id,
        quantity: lossQuantity,
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
    adjustUnitCost,
    setAdjustUnitCost,
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
