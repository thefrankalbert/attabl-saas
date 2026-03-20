'use client';

import { useSubscription } from '@/contexts/SubscriptionContext';
import { TrialBanner } from '@/components/admin/TrialBanner';
import { FrozenBanner } from '@/components/shared/FrozenBanner';
import { PastDueBanner } from '@/components/shared/PastDueBanner';

interface SubscriptionBannersProps {
  tenantSlug: string;
}

/**
 * Renders the appropriate subscription status banner based on current status.
 * Only one banner is shown at a time, in priority order: frozen > past_due > trial.
 */
export function SubscriptionBanners({ tenantSlug }: SubscriptionBannersProps) {
  const { isFrozen, isPastDue } = useSubscription();

  if (isFrozen) {
    return <FrozenBanner tenantSlug={tenantSlug} />;
  }

  if (isPastDue) {
    return <PastDueBanner />;
  }

  return <TrialBanner tenantSlug={tenantSlug} />;
}
