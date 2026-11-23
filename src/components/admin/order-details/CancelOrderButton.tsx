'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CircleX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useToast } from '@/components/ui/use-toast';
import { actionUpdateOrderStatus } from '@/app/actions/orders';
import type { Order } from '@/types/admin.types';

interface CancelOrderButtonProps {
  order: Order;
  /** `orders.pay`: le droit qu'exige l'annulation cote serveur (actionUpdateOrderStatus). */
  canPay: boolean;
  onCancelled: () => void;
}

/**
 * Annuler une commande depuis sa fiche (troisieme contre-audit du lot A).
 *
 * Sans ce bouton, l'annulation n'existait que dans la liste des commandes
 * recentes du tableau de bord: une commande d'ardoise ancienne et remboursee
 * ne pouvait jamais etre annulee, et l'ardoise jamais soldee.
 *
 * Visible seulement quand les regles de `cancelOrder` l'acceptent (ni payee, ni
 * deja annulee) et que la personne a le droit de l'action serveur existante,
 * qui est reutilisee telle quelle.
 */
export function CancelOrderButton({ order, canPay, onCancelled }: CancelOrderButtonProps) {
  const t = useTranslations('orders');
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const paymentStatus = order.payment_status ?? 'pending';
  if (!canPay || order.status === 'cancelled' || paymentStatus === 'paid') return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const result = await actionUpdateOrderStatus(order.tenant_id, order.id, 'cancelled');
      if (result.error) {
        toast({ title: t('cancelOrderFailed'), description: result.error, variant: 'destructive' });
        return;
      }
      toast({ title: t('cancelOrderDone') });
      setOpen(false);
      onCancelled();
    } catch {
      toast({ title: t('cancelOrderFailed'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={loading}
        className="w-full justify-start h-8 text-xs text-[var(--destructive)]"
      >
        <CircleX className="w-3.5 h-3.5 mr-1.5" /> {t('cancelOrderButton')}
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => !loading && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cancelOrderTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('cancelOrderDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>{t('cancelOrderKeep')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
              disabled={loading}
              className="bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {t('cancelOrderButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
