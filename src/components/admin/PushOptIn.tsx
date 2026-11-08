'use client';

import { useTranslations } from 'next-intl';
import { Bell, BellOff, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushSubscription } from '@/hooks/usePushSubscription';

interface PushOptInProps {
  tenantId: string;
}

export function PushOptIn({ tenantId }: PushOptInProps) {
  const t = useTranslations('pushNotifications');
  const { isSubscribed, isSupported, isLoading, motifIndisponible, subscribe, unsubscribe } =
    usePushSubscription({
      tenantId,
    });

  // DISPARAITRE SANS UN MOT N'EST PAS ACCEPTABLE. Le composant rendait `null`
  // des que le push etait indisponible: un restaurateur sur iPhone qui n'a pas
  // installe l'application sur son ecran d'accueil ne voyait aucun bouton et
  // aucune explication. Chaque cas a maintenant son message.
  if (!isSupported) {
    if (!motifIndisponible) return null;
    return (
      <div className="flex items-start gap-3 rounded-lg border border-app-border p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-app-text-muted" />
        <div>
          <p className="text-sm font-medium">{t('title')}</p>
          <p className="text-xs text-app-text-secondary">{t(`unavailable.${motifIndisponible}`)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-app-border p-4">
      <div className="flex items-center gap-3">
        {isSubscribed ? (
          <Bell className="h-5 w-5 text-[var(--success)]" />
        ) : (
          <BellOff className="h-5 w-5 text-app-text-muted" />
        )}
        <div>
          <p className="text-sm font-medium">{t('title')}</p>
          <p className="text-xs text-app-text-secondary">
            {isSubscribed ? t('enabledDesc') : t('disabledDesc')}
          </p>
        </div>
      </div>
      <Button
        variant={isSubscribed ? 'outline' : 'default'}
        size="sm"
        onClick={() => (isSubscribed ? unsubscribe() : subscribe())}
        disabled={isLoading}
      >
        {isLoading ? t('loading') : isSubscribed ? t('disable') : t('enable')}
      </Button>
    </div>
  );
}
