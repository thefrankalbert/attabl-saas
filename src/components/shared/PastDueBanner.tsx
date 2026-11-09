'use client';

import { CreditCard } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { billingCapabilities } from '@/lib/billing/provider';
import { logger } from '@/lib/logger';

/** `showManageCard`: faux pour qui n'est ni owner ni admin (le portail le refuse). */
export function PastDueBanner({ showManageCard = true }: { showManageCard?: boolean }) {
  const [loading, setLoading] = useState(false);
  // Le portail de facturation est une CAPACITE du prestataire, pas un acquis:
  // Stripe en heberge un, un agregateur mobile money non (voir
  // `lib/billing/provider`). Sans portail, ce bouton meneraient a une route qui
  // ne peut rien rendre.
  //
  // A FAIRE le jour ou un prestataire sans portail devient actif: le message
  // ci-dessous dit "Mettez a jour votre carte", ce qui n'a pas de sens sans
  // carte ni portail. Il faudra une invitation a regler la periode en cours.
  const canOpenPortal = showManageCard && billingCapabilities().hostedPortal;

  const handleManageCard = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing-portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      logger.error('Failed to open billing portal', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-status-warning/10 border-b border-status-warning/20 px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <CreditCard className="w-4 h-4 text-status-warning shrink-0" />
        <p className="text-xs sm:text-sm font-medium text-status-warning truncate">
          Votre paiement a échoué. Mettez à jour votre carte.
        </p>
      </div>
      {canOpenPortal && (
        <Button
          variant="default"
          onClick={handleManageCard}
          disabled={loading}
          className="shrink-0 bg-status-warning text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 h-auto"
        >
          {loading ? 'Chargement...' : 'Mettre à jour'}
        </Button>
      )}
    </div>
  );
}
