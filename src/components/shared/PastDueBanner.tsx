'use client';

import { CreditCard } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

export function PastDueBanner() {
  const [loading, setLoading] = useState(false);

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
      <Button
        variant="default"
        onClick={handleManageCard}
        disabled={loading}
        className="shrink-0 bg-status-warning text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 h-auto"
      >
        {loading ? 'Chargement...' : 'Mettre à jour'}
      </Button>
    </div>
  );
}
