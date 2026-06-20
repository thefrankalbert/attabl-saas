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
      className={`flex items-center justify-between gap-2 @sm:gap-3 px-3 @sm:px-4 py-2 @sm:py-2.5 text-xs @sm:text-sm ${styleConfig.containerClass}`}
      role="alert"
    >
      <div className="flex items-center gap-1.5 @sm:gap-2 min-w-0 flex-wrap">
        <Clock className={`w-4 h-4 flex-shrink-0 ${styleConfig.iconClass}`} />
        <span className={`font-medium ${styleConfig.textClass}`}>{message}</span>
        <Link
          href={upgradeUrl}
          className={`inline-flex items-center gap-1 font-semibold whitespace-nowrap hover:underline ${styleConfig.linkClass}`}
        >
          {t('upgradeToPremium')}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsDismissed(true)}
        className={`flex-shrink-0 p-0.5 h-auto w-auto rounded-full transition-colors ${styleConfig.closeClass}`}
        aria-label={t('closeAriaLabel')}
      >
        <X className="w-4 h-4" />
      </Button>
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
      containerClass: 'border-b border-[var(--border)]',
      iconClass: 'text-[var(--destructive)]',
      textClass: 'text-[var(--destructive)]',
      linkClass: 'text-[var(--destructive)]',
      closeClass: 'hover:bg-[var(--accent)] text-[var(--destructive)]',
    };
  }

  if (daysRemaining === 2) {
    return {
      containerClass: 'border-b border-[var(--border)]',
      iconClass: 'text-[var(--warning)]',
      textClass: 'text-[var(--warning)]',
      linkClass: 'text-[var(--warning)]',
      closeClass: 'hover:bg-[var(--accent)] text-[var(--warning)]',
    };
  }

  return {
    containerClass: 'border-b border-[var(--border)]',
    iconClass: 'text-[var(--muted-foreground)]',
    textClass: 'text-[var(--muted-foreground)]',
    linkClass: 'text-[var(--muted-foreground)]',
    closeClass: 'hover:bg-[var(--accent)] text-[var(--muted-foreground)]',
  };
}
