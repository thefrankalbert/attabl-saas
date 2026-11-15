'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface FlutterwaveReturnHandlerProps {
  /** `status` renvoye par Flutterwave dans l'URL de retour. */
  status: string | null;
  /** `transaction_id` renvoye par Flutterwave dans l'URL de retour. */
  transactionId: string | null;
}

/**
 * Retour de la page de paiement Flutterwave. Le webhook prolonge l'abonnement;
 * ici on demande la meme verification cote serveur pour ne pas faire attendre
 * le client (idempotent: payer + revenir + webhook ne prolonge qu'une fois).
 * Ne rend rien: seulement un message et un rafraichissement.
 */
export function FlutterwaveReturnHandler({ status, transactionId }: FlutterwaveReturnHandlerProps) {
  const t = useTranslations('admin');
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    // Doc Flutterwave: le retour porte status = successful, cancelled ou failed.
    if (status !== 'successful' || !transactionId) {
      toast.error(t('subscription.mobileMoneyReturnCancelled'));
      router.replace(window.location.pathname);
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/billing/flutterwave/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionId }),
        });
        const data = (await res.json()) as { status?: string };
        if (data.status === 'applied' || data.status === 'already_applied') {
          toast.success(t('subscription.mobileMoneyReturnApplied'));
        } else {
          toast.message(t('subscription.mobileMoneyReturnPending'));
        }
      } catch (error) {
        logger.error('Flutterwave return confirmation failed', error);
        toast.message(t('subscription.mobileMoneyReturnPending'));
      }
      router.replace(window.location.pathname);
      router.refresh();
    })();
  }, [status, transactionId, router, t]);

  return null;
}
