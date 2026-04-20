'use client';

import { useCallback, useRef, useState } from 'react';
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

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

/**
 * Hook that returns a Promise-based confirm() function and a Dialog element
 * to render. Replaces window.confirm (which is banned by the design system).
 *
 * Usage:
 *   const { confirm, Dialog } = useConfirmDialog();
 *   const handleDelete = async () => {
 *     const ok = await confirm({ title: 'Delete?', description: '...' });
 *     if (ok) { ... }
 *   };
 *   return (<>{Dialog}<button onClick={handleDelete}>Delete</button></>);
 */
export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const resolve = useCallback((value: boolean) => {
    setOpen(false);
    const r = resolverRef.current;
    resolverRef.current = null;
    r?.(value);
  }, []);

  const Dialog = (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resolve(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          <AlertDialogDescription>{options?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => resolve(false)}>
            {options?.cancelLabel ?? 'Annuler'}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => resolve(true)}
            className={options?.destructive ? 'bg-red-500 text-white hover:bg-red-600' : undefined}
          >
            {options?.confirmLabel ?? 'Confirmer'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, Dialog };
}
