'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import AdminModal from '@/components/admin/AdminModal';
import type { SupplierFormController } from './useSupplierForm';

interface SupplierFormModalProps {
  form: SupplierFormController;
}

// Add / Edit supplier modal, driven by the useSupplierForm controller.
export default function SupplierFormModal({ form }: SupplierFormModalProps) {
  const t = useTranslations('suppliers');

  const handleClose = () => {
    form.setModalMode(null);
    form.resetForm();
  };

  return (
    <AdminModal
      isOpen={form.modalMode !== null}
      onClose={handleClose}
      title={form.modalMode === 'add' ? t('addSupplierTitle') : t('editSupplierTitle')}
      size="lg"
    >
      <div className="space-y-4 pt-4">
        <div>
          <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
            {t('nameLabel')}
          </Label>
          <Input
            value={form.formName}
            onChange={(e) => form.setFormName(e.target.value)}
            placeholder={t('namePlaceholder')}
            autoFocus
          />
        </div>

        <div>
          <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
            {t('contactPerson')}
          </Label>
          <Input
            value={form.formContact}
            onChange={(e) => form.setFormContact(e.target.value)}
            placeholder={t('contactPlaceholder')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
              {t('phoneLabel')}
            </Label>
            <Input
              value={form.formPhone}
              onChange={(e) => form.setFormPhone(e.target.value)}
              placeholder="+237..."
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
              {t('emailLabel')}
            </Label>
            <Input
              type="email"
              value={form.formEmail}
              onChange={(e) => form.setFormEmail(e.target.value)}
              placeholder="contact@..."
            />
          </div>
        </div>

        <div>
          <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
            {t('addressLabel')}
          </Label>
          <Input
            value={form.formAddress}
            onChange={(e) => form.setFormAddress(e.target.value)}
            placeholder={t('addressPlaceholder')}
          />
        </div>

        <div>
          <Label className="text-xs font-medium text-app-text-secondary mb-1 block">
            {t('notesLabel')}
          </Label>
          <Input
            value={form.formNotes}
            onChange={(e) => form.setFormNotes(e.target.value)}
            placeholder={t('notesPlaceholder')}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" onClick={handleClose}>
          {t('cancelAction')}
        </Button>
        <Button onClick={form.handleSave} disabled={form.isSubmitting} variant="default">
          {t('save')}
        </Button>
      </div>
    </AdminModal>
  );
}
