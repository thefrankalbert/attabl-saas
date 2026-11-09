'use client';

import { useSubscription } from '@/contexts/SubscriptionContext';
import { TrialBanner } from '@/components/admin/TrialBanner';
import { FrozenBanner } from '@/components/shared/FrozenBanner';
import { PastDueBanner } from '@/components/shared/PastDueBanner';

interface SubscriptionBannersProps {
  tenantSlug: string;
  /** Jours de carte encore visible apres la fin de l'essai, sinon `null`. */
  menuDaysLeft?: number | null;
}

/**
 * Renders the appropriate subscription status banner based on current status.
 * Only one banner is shown at a time, in priority order: frozen > past_due > trial.
 */
export function SubscriptionBanners({ tenantSlug, menuDaysLeft = null }: SubscriptionBannersProps) {
  const { isFrozen, isPastDue } = useSubscription();

  if (isFrozen) {
    return <FrozenBanner tenantSlug={tenantSlug} menuDaysLeft={menuDaysLeft} />;
  }

  if (isPastDue) {
    return <PastDueBanner />;
  }

  return <TrialBanner tenantSlug={tenantSlug} />;
}
