'use client';

import { useSubscription } from '@/contexts/SubscriptionContext';
import { TrialBanner } from '@/components/admin/TrialBanner';
import { FrozenBanner } from '@/components/shared/FrozenBanner';
import { PastDueBanner } from '@/components/shared/PastDueBanner';
import { usePermissions } from '@/hooks/usePermissions';
import { canOpenAdminSubPath } from '@/lib/auth/admin-route-permissions';

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
  // Le message reste visible pour toute l'equipe; le bouton d'action seulement
  // pour qui peut agir. /subscription s'ouvre avec `billing.manage` (niveau
  // borne compris: le gerant voit), et le portail de facturation
  // (/api/billing-portal) exige ce droit EN ENTIER (payer).
  const { levels, can } = usePermissions();
  const canOpenPlans = canOpenAdminSubPath('/subscription', levels);
  const canOpenBillingPortal = can('billing.manage');

  if (isFrozen) {
    return (
      <FrozenBanner
        tenantSlug={tenantSlug}
        menuDaysLeft={menuDaysLeft}
        showPlansLink={canOpenPlans}
      />
    );
  }

  if (isPastDue) {
    return <PastDueBanner showManageCard={canOpenBillingPortal} />;
  }

  return <TrialBanner tenantSlug={tenantSlug} showPlansLink={canOpenPlans} />;
}
