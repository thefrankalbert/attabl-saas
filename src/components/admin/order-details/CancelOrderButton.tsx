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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { actionUpdateOrderStatus } from '@/app/actions/orders';
import type { Order } from '@/types/admin.types';

interface CancelOrderButtonProps {
  order: Order;
  /** `orders.pay`: le droit qu'exige l'annulation cote serveur (actionUpdateOrderStatus). */
  canPay: boolean;
  /**
   * Autorite sur l'argent (owner, admin, manager): `canComp` de useOrderDetails,
   * equivalent client de `has_tenant_money_permission`. La politique UPDATE de
   * `orders` l'exige pour toucher une commande remboursee ou offerte.
   */
  canManageMoney: boolean;
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
 * deja annulee), que la personne a le droit de l'action serveur existante
 * (reutilisee telle quelle) et, pour une commande remboursee ou offerte,
 * l'autorite sur l'argent qu'exige la base.
 */
export function CancelOrderButton({
  order,
  canPay,
  canManageMoney,
  onCancelled,
}: CancelOrderButtonProps) {
  const t = useTranslations('orders');
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const paymentStatus = order.payment_status ?? 'pending';
  if (!canPay || order.status === 'cancelled' || paymentStatus === 'paid') return null;
  // Remboursee ou offerte: cancelOrder l'accepte, mais la base la refuse a qui
  // n'a pas l'autorite sur l'argent (le caissier lisait "Annulation
  // impossible" apres avoir confirme). Le bouton suit la regle reelle.
  if ((paymentStatus === 'refunded' || paymentStatus === 'comp') && !canManageMoney) return null;
  // Acompte au registre (partial): la base ne laisse annuler qu'a l'autorite sur
  // l'argent (migration 20261124160000); cancelOrder traduit ce refus.
  if (paymentStatus === 'partial' && !canManageMoney) return null;

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

  // Le bouton est le declencheur de la boite (AlertDialogTrigger asChild, un
  // seul element bouton): a la fermeture (Echap, "Garder la commande"), Radix
  // rend le focus au bouton au lieu de BODY (verification visuelle, D4).
  return (
    <AlertDialog open={open} onOpenChange={(o) => !loading && setOpen(o)}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          className="w-full justify-start h-8 text-xs text-[var(--destructive)]"
        >
          <CircleX className="w-3.5 h-3.5 mr-1.5" /> {t('cancelOrderButton')}
        </Button>
      </AlertDialogTrigger>
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
            className="bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:bg-[var(--destructive)] hover:opacity-90"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {t('cancelOrderButton')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
