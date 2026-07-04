'use client';

import { useTranslations } from 'next-intl';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ItemDeleteDialogProps {
  deleteTarget: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ItemDeleteDialog({ deleteTarget, onOpenChange, onConfirm }: ItemDeleteDialogProps) {
  const t = useTranslations('items');
  const tc = useTranslations('common');

  return (
    <AlertDialog open={!!deleteTarget} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tc('confirmDelete')}</AlertDialogTitle>
          <AlertDialogDescription>
            {deleteTarget ? t('deleteConfirm', { name: deleteTarget.name }) : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90"
          >
            {tc('delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
