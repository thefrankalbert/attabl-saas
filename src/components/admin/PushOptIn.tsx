'use client';

import { useTranslations } from 'next-intl';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushSubscription } from '@/hooks/usePushSubscription';

interface PushOptInProps {
  tenantId: string;
}

export function PushOptIn({ tenantId }: PushOptInProps) {
  const t = useTranslations('pushNotifications');
  const { isSubscribed, isSupported, isLoading, subscribe, unsubscribe } = usePushSubscription({
    tenantId,
  });

  if (!isSupported) return null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-border-default p-4">
      <div className="flex items-center gap-3">
        {isSubscribed ? (
          <Bell className="h-5 w-5 text-green-500" />
        ) : (
          <BellOff className="h-5 w-5 text-text-muted" />
        )}
        <div>
          <p className="text-sm font-medium">{t('title')}</p>
          <p className="text-xs text-text-secondary">
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
