'use client';

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
import type { MenuDetailVM } from './use-menu-detail';

interface Props {
  vm: MenuDetailVM;
}

export function DeleteCategoryDialog({ vm }: Props) {
  const { tc, tCat, deleteTarget, setDeleteTarget, confirmDeleteCategory } = vm;

  return (
    <AlertDialog
      open={!!deleteTarget}
      onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tc('confirmDelete')}</AlertDialogTitle>
          <AlertDialogDescription>
            {deleteTarget ? tCat('deleteCategoryConfirm', { name: deleteTarget.name }) : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDeleteCategory}
            className="bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90"
          >
            {tc('delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
