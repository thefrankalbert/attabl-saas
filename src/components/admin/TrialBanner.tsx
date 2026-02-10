'use client';

import { useSubscription } from '@/contexts/SubscriptionContext';
import Link from 'next/link';
import { Clock, ArrowRight, X } from 'lucide-react';
import { useState } from 'react';

interface TrialBannerProps {
  tenantSlug: string;
}

export function TrialBanner({ tenantSlug }: TrialBannerProps) {
  const { isInTrial, daysRemaining } = useSubscription();
  const [isDismissed, setIsDismissed] = useState(false);

  if (!isInTrial || isDismissed || daysRemaining > 3) {
    return null;
  }

  const upgradeUrl = `/sites/${tenantSlug}/admin/subscription`;
  const styleConfig = getStyleConfig(daysRemaining);

  const message =
    daysRemaining <= 1
      ? 'Votre essai gratuit expire aujourd\u2019hui !'
      : `Il vous reste ${daysRemaining} jour${daysRemaining > 1 ? 's' : ''} d\u2019essai gratuit.`;

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm ${styleConfig.containerClass}`}
      role="alert"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Clock className={`w-4 h-4 flex-shrink-0 ${styleConfig.iconClass}`} />
        <span className={`font-medium truncate ${styleConfig.textClass}`}>{message}</span>
        <Link
          href={upgradeUrl}
          className={`inline-flex items-center gap-1 font-semibold whitespace-nowrap hover:underline ${styleConfig.linkClass}`}
        >
          Passer au Premium
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <button
        onClick={() => setIsDismissed(true)}
        className={`flex-shrink-0 p-0.5 rounded-full transition-colors ${styleConfig.closeClass}`}
        aria-label="Fermer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

interface StyleConfig {
  containerClass: string;
  iconClass: string;
  textClass: string;
  linkClass: string;
  closeClass: string;
}

function getStyleConfig(daysRemaining: number): StyleConfig {
  if (daysRemaining <= 1) {
    return {
      containerClass: 'bg-red-50 border-b border-red-200',
      iconClass: 'text-red-500',
      textClass: 'text-red-700',
      linkClass: 'text-red-800',
      closeClass: 'hover:bg-red-100 text-red-500',
    };
  }

  if (daysRemaining === 2) {
    return {
      containerClass: 'bg-amber-50 border-b border-amber-200',
      iconClass: 'text-amber-500',
      textClass: 'text-amber-700',
      linkClass: 'text-amber-800',
      closeClass: 'hover:bg-amber-100 text-amber-500',
    };
  }

  return {
    containerClass: 'bg-blue-50 border-b border-blue-200',
    iconClass: 'text-blue-500',
    textClass: 'text-blue-700',
    linkClass: 'text-blue-800',
    closeClass: 'hover:bg-blue-100 text-blue-500',
  };
}
