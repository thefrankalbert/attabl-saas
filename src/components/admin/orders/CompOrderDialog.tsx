'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Gift, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { actionCompOrder } from '@/app/actions/orders';

interface CompOrderDialogProps {
  tenantId: string;
  orderId: string;
  /** Called after a successful comp so the parent can refresh. */
  onComped: () => void;
}

/**
 * "Offrir la commande" (comp) - a MANAGER action. Only rendered when the caller
 * has already established the actor is manager-capable; the server action
 * re-checks the role (owner/admin/manager) so this is defense-in-depth, not the
 * only gate. Closing an order for free is a fraud surface, hence the reason is
 * required and audited server-side.
 */
export default function CompOrderDialog({ tenantId, orderId, onComped }: CompOrderDialogProps) {
  const t = useTranslations('payment');
  const tc = useTranslations('common');
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleComp = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    const res = await actionCompOrder(tenantId, orderId, reason.trim());
    setLoading(false);
    if (res.error) {
      toast({ title: t('compError'), description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: t('compSuccess') });
    setReason('');
    setOpen(false);
    onComped();
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-9 w-full text-xs"
      >
        <Gift className="w-3.5 h-3.5 mr-1.5" />
        {t('compOrder')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('compOrder')}</DialogTitle>
            <DialogDescription>{t('compReasonPlaceholder')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="comp-reason" className="text-xs">
              {t('compReason')}
            </Label>
            <Textarea
              id="comp-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={t('compReasonPlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleComp} disabled={loading || !reason.trim()}>
              {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              {t('compConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
