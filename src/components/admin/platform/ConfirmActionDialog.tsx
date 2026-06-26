'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export interface ConfirmActionState {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  withReason?: boolean;
  /** When set, the operator must type this exact string to enable confirm. */
  requireText?: string | null;
  onConfirm: (reason?: string) => void;
}

interface ConfirmActionDialogProps {
  state: ConfirmActionState | null;
  onClose: () => void;
  pending: boolean;
}

/**
 * Reusable confirmation dialog for god-mode actions. Supports an optional
 * free-text reason (recorded in the audit trail) and an optional type-to-confirm
 * guard for the most destructive actions (soft-deleting a tenant).
 */
export function ConfirmActionDialog({ state, onClose, pending }: ConfirmActionDialogProps) {
  const t = useTranslations('admin.platform');
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');

  // Reset transient fields when a NEW action opens the dialog. Adjusting state
  // during render (the React-recommended pattern for "reset on prop change")
  // instead of an effect avoids a cascading-render lint error.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    setReason('');
    setTyped('');
  }

  const open = state !== null;
  const needsText = !!state?.requireText;
  const textOk = !needsText || typed.trim() === state?.requireText?.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md mx-4 sm:mx-auto">
        {state && (
          <>
            <DialogHeader>
              <DialogTitle>{state.title}</DialogTitle>
              <DialogDescription>{state.description}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              {state.withReason && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm-reason">{t('reasonLabel')}</Label>
                  <Textarea
                    id="confirm-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t('reasonPlaceholder')}
                    rows={3}
                    maxLength={500}
                  />
                </div>
              )}

              {needsText && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm-text">
                    {t('typeToConfirm', { name: state.requireText ?? '' })}
                  </Label>
                  <Input
                    id="confirm-text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={pending}
                className="min-h-[44px]"
              >
                {t('cancel')}
              </Button>
              <Button
                variant={state.destructive ? 'destructive' : 'default'}
                onClick={() => state.onConfirm(state.withReason ? reason : undefined)}
                disabled={pending || !textOk}
                className="min-h-[44px]"
              >
                {pending ? t('working') : state.confirmLabel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
