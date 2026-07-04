'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { actionCreateSupplier, actionUpdateSupplier } from '@/app/actions/suppliers';
import type { Supplier, CreateSupplierInput } from '@/types/supplier.types';

export type ModalMode = 'add' | 'edit' | null;

// Form state + create/update orchestration for the add/edit supplier modal.
export function useSupplierForm(tenantId: string, loadSuppliers: () => void) {
  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();
  const t = useTranslations('suppliers');
  const tc = useTranslations('common');

  const resetForm = () => {
    setFormName('');
    setFormContact('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormNotes('');
    setSelectedSupplier(null);
  };

  const openAdd = () => {
    resetForm();
    setModalMode('add');
  };

  const openEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormName(supplier.name);
    setFormContact(supplier.contact_name || '');
    setFormPhone(supplier.phone || '');
    setFormEmail(supplier.email || '');
    setFormAddress(supplier.address || '');
    setFormNotes(supplier.notes || '');
    setModalMode('edit');
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
        const input: CreateSupplierInput = {
          name: formName.trim(),
          contact_name: formContact.trim() || undefined,
          phone: formPhone.trim() || undefined,
          email: formEmail.trim() || undefined,
          address: formAddress.trim() || undefined,
          notes: formNotes.trim() || undefined,
        };
        const r = await actionCreateSupplier(tenantId, input);
        if (r.error) throw new Error(r.error);
        toast({ title: t('supplierAdded') });
      } else if (modalMode === 'edit' && selectedSupplier) {
        const r = await actionUpdateSupplier(tenantId, selectedSupplier.id, {
          name: formName.trim(),
          contact_name: formContact.trim() || null,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          address: formAddress.trim() || null,
          notes: formNotes.trim() || null,
        });
        if (r.error) throw new Error(r.error);
        toast({ title: t('supplierModified') });
      }
      setModalMode(null);
      resetForm();
      loadSuppliers();
    } catch {
      toast({ title: tc('error'), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    modalMode,
    setModalMode,
    formName,
    setFormName,
    formContact,
    setFormContact,
    formPhone,
    setFormPhone,
    formEmail,
    setFormEmail,
    formAddress,
    setFormAddress,
    formNotes,
    setFormNotes,
    isSubmitting,
    resetForm,
    openAdd,
    openEdit,
    handleSave,
  };
}

export type SupplierFormController = ReturnType<typeof useSupplierForm>;
