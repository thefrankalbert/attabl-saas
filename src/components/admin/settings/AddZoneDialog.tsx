'use client';

import { type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AdminModal from '@/components/admin/AdminModal';

interface AddZoneDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  zoneName: string;
  onZoneNameChange: (value: string) => void;
  zonePrefix: string;
  onZonePrefixChange: (value: string) => void;
  saving: boolean;
}

export function AddZoneDialog({
  isOpen,
  onClose,
  onSubmit,
  zoneName,
  onZoneNameChange,
  zonePrefix,
  onZonePrefixChange,
  saving,
}: AddZoneDialogProps) {
  const t = useTranslations('tables');

  return (
    <AdminModal isOpen={isOpen} onClose={onClose} title={t('modalAddZoneTitle')}>
      <form onSubmit={onSubmit} className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label htmlFor="zone-name" className="text-sm text-app-text">
            {t('zoneNameLabel')}
          </Label>
          <Input
            id="zone-name"
            value={zoneName}
            onChange={(e) => onZoneNameChange(e.target.value)}
            placeholder={t('zoneNamePlaceholder')}
            className="rounded-lg focus:ring-accent"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="zone-prefix" className="text-sm text-app-text">
            {t('zonePrefixLabel')}
          </Label>
          <Input
            id="zone-prefix"
            value={zonePrefix}
            onChange={(e) => onZonePrefixChange(e.target.value)}
            placeholder={t('zonePrefixPlaceholder')}
            className="rounded-lg focus:ring-accent"
            required
            maxLength={5}
          />
          <p className="text-xs text-app-text-secondary">{t('zonePrefixHelp')}</p>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            className="bg-accent text-accent-text hover:bg-accent-hover"
            disabled={saving}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('createZoneSubmit')}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
