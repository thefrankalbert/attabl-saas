import type { SelfServicePlan } from './pricing-format';

/**
 * Ce que chaque formule apporte, en cles i18n `admin.subscription.*`.
 * Listes cumulatives: chaque formule ne liste que ce qu'elle ajoute a la
 * precedente (voir INCLUDES_PLAN). Partage par la page abonnement et le paiement.
 */
export const PLAN_FEATURES: Record<SelfServicePlan, string[]> = {
  starter: [
    'feature1Space',
    'featureUnlimitedMenu',
    'featureBasicPOS',
    'featureHdPhotos',
    'featureEmailSupport',
  ],
  pro: [
    'featureFullPOS',
    'featureKDS',
    'featureInventory',
    'featureTableOrder',
    'featureAdvancedStats',
  ],
  business: [
    'feature10Spaces',
    'featureRoomService',
    'featureDelivery',
    'featureAIAnalytics',
    'featureUnlimitedStaff',
  ],
};

/** Formule dont chaque formule reprend tout (null pour la premiere). */
export const INCLUDES_PLAN: Record<SelfServicePlan, SelfServicePlan | null> = {
  starter: null,
  pro: 'starter',
  business: 'pro',
};
