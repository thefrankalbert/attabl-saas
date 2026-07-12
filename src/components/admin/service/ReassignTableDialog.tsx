'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { actionReassignOrderTable } from '@/app/actions/table-reassign';
import { logger } from '@/lib/logger';

export interface ReassignFreeTable {
  /** table_number - the value written on the order + session. */
  tableNumber: string;
  /** Human label (display_name or table_number). */
  label: string;
}

interface ReassignTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  /** Tables currently free (no open session), the only valid destinations. */
  freeTables: ReassignFreeTable[];
  /** Called after a successful reassign so the parent can refresh its data. */
  onReassigned: () => void;
  labels: {
    title: string;
    description: string;
    placeholder: string;
    noFreeTables: string;
    confirm: string;
    cancel: string;
    moving: string;
    success: string;
    error: string;
  };
  /** Toast helper injected by the parent (project uses useToast). */
  toast: (opts: { title: string; description?: string; variant?: 'destructive' }) => void;
}

/**
 * Move a dine-in order to a free table. Thin controlled dialog over
 * actionReassignOrderTable (which does the atomic table_sessions bookkeeping in
 * the reassign_order_table RPC). Only free tables are offered so a move never
 * merges two parties onto one check.
 */
export function ReassignTableDialog({
  open,
  onOpenChange,
  orderId,
  freeTables,
  onReassigned,
  labels,
  toast,
}: ReassignTableDialogProps) {
  const [target, setTarget] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!target || submitting) return;
    setSubmitting(true);
    try {
      const res = await actionReassignOrderTable(orderId, target);
      if (res.success) {
        toast({ title: labels.success });
        onReassigned();
        onOpenChange(false);
        setTarget('');
      } else {
        toast({ title: labels.error, description: res.error, variant: 'destructive' });
      }
    } catch (err) {
      logger.error('ReassignTableDialog: reassign failed', { err, orderId });
      toast({ title: labels.error, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>

        {freeTables.length > 0 ? (
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={labels.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {freeTables.map((tbl) => (
                <SelectItem key={tbl.tableNumber} value={tbl.tableNumber}>
                  {tbl.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="py-2 text-sm text-app-text-muted">{labels.noFreeTables}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {labels.cancel}
          </Button>
          <Button onClick={handleConfirm} disabled={!target || submitting}>
            {submitting ? labels.moving : labels.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
