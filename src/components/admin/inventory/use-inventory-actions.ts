'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { useTranslations } from 'next-intl';
import {
  actionCreateIngredient,
  actionUpdateIngredient,
  actionAdjustStock,
} from '@/app/actions/inventory';
import type {
  Ingredient,
  IngredientUnit,
  CreateIngredientInput,
  MovementType,
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

  // Adjust stock fields
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<MovementType>('manual_add');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustSupplierId, setAdjustSupplierId] = useState('');
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
    setAdjustQty('');
    setAdjustType('manual_add');
    setAdjustNotes('');
    setAdjustSupplierId('');
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
    setModalMode('edit');
  };

  const openAdjust = (ing: Ingredient) => {
    setSelectedIngredient(ing);
    setAdjustQty('');
    setAdjustType('manual_add');
    setAdjustNotes('');
    setModalMode('adjust');
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

    setIsSubmitting(true);
    try {
      const r = await actionAdjustStock(tenantId, {
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
    adjustQty,
    setAdjustQty,
    adjustType,
    setAdjustType,
    adjustNotes,
    setAdjustNotes,
    adjustSupplierId,
    setAdjustSupplierId,
    isSubmitting,
    confirmDeactivate,
    setConfirmDeactivate,
    openAdd,
    openEdit,
    openAdjust,
    closeModal,
    handleSave,
    handleDeactivate,
    handleAdjust,
  };
}
