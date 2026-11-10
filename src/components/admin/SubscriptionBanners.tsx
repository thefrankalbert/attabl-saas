'use client';

import { useSubscription } from '@/contexts/SubscriptionContext';
import { TrialBanner } from '@/components/admin/TrialBanner';
import { FrozenBanner } from '@/components/shared/FrozenBanner';
import { PastDueBanner } from '@/components/shared/PastDueBanner';
import { usePermissions } from '@/hooks/usePermissions';
import { canOpenAdminSubPath } from '@/lib/auth/admin-route-permissions';
import { isRoleAllowed } from '@/lib/admin-roles';

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
  // pour qui peut agir. /subscription exige settings.view, et le portail de
  // facturation (/api/billing-portal) n'accepte que owner et admin.
  const { role, permissions } = usePermissions();
  const canOpenPlans = canOpenAdminSubPath('/subscription', permissions);
  const canOpenBillingPortal = canOpenPlans && isRoleAllowed(role, ['owner', 'admin']);

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
