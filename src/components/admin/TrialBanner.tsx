'use client';

import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Clock, ArrowRight, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface TrialBannerProps {
  tenantSlug: string;
}

export function TrialBanner({ tenantSlug }: TrialBannerProps) {
  const { isInTrial, daysRemaining } = useSubscription();
  const t = useTranslations('trial');
  const [isDismissed, setIsDismissed] = useState(false);

  if (!isInTrial || isDismissed || daysRemaining > 3) {
    return null;
  }

  const upgradeUrl = `/sites/${tenantSlug}/admin/subscription`;
  const styleConfig = getStyleConfig(daysRemaining);

  const message =
    daysRemaining <= 1 ? t('expiresToday') : t('daysRemaining', { count: daysRemaining });

  return (
    <div
      className={`flex items-center justify-between gap-2 border-b px-4 py-2.5 text-xs sm:gap-3 sm:text-sm ${styleConfig.containerClass}`}
      role="alert"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Clock className={`h-4 w-4 flex-shrink-0 ${styleConfig.iconClass}`} />
        <span className={`font-medium ${styleConfig.textClass}`}>{message}</span>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        <Link
          href={upgradeUrl}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-90 ${styleConfig.ctaClass}`}
        >
          {t('upgradeToPremium')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsDismissed(true)}
          className={`h-auto w-auto flex-shrink-0 rounded-full p-1 transition-colors ${styleConfig.closeClass}`}
          aria-label={t('closeAriaLabel')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface StyleConfig {
  containerClass: string;
  iconClass: string;
  textClass: string;
  ctaClass: string;
  closeClass: string;
}

function getStyleConfig(daysRemaining: number): StyleConfig {
  if (daysRemaining <= 1) {
    return {
      containerClass: 'bg-status-error/10 border-status-error/20',
      iconClass: 'text-status-error',
      textClass: 'text-status-error',
      ctaClass: 'bg-status-error text-white',
      closeClass: 'text-status-error hover:bg-status-error/10',
    };
  }

  if (daysRemaining === 2) {
    return {
      containerClass: 'bg-status-warning/10 border-status-warning/20',
      iconClass: 'text-status-warning',
      textClass: 'text-status-warning',
      ctaClass: 'bg-status-warning text-white',
      closeClass: 'text-status-warning hover:bg-status-warning/10',
    };
  }

  return {
    containerClass: 'bg-status-info/10 border-status-info/20',
    iconClass: 'text-status-info',
    textClass: 'text-status-info',
    ctaClass: 'bg-status-info text-white',
    closeClass: 'text-status-info hover:bg-status-info/10',
  };
}
