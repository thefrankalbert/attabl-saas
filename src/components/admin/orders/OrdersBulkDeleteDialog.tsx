'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Trash2 } from 'lucide-react';

interface OrdersBulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  isDeleting: boolean;
  onConfirm: () => void;
}

/** Bulk delete confirmation dialog. */
export default function OrdersBulkDeleteDialog({
  open,
  onOpenChange,
  selectedCount,
  isDeleting,
  onConfirm,
}: OrdersBulkDeleteDialogProps) {
  const t = useTranslations('orders');
  const tc = useTranslations('common');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-app-text">
            {t('bulkDeleteConfirm', { count: selectedCount })}
          </DialogTitle>
          <DialogDescription className="text-sm text-app-text-muted py-2">
            {t('bulkDeleteDesc')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            {tc('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            className="gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? tc('loading') : tc('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
