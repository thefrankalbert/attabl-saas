export type BillingPeriod = 'monthly' | 'semiannual' | 'yearly';

export type ComparisonValue = boolean | { kind: 'unlimited' } | { kind: 'text'; value: string };

export interface FeatureRow {
  labelKey: string;
  starter: ComparisonValue;
  pro: ComparisonValue;
  business: ComparisonValue;
  enterprise: ComparisonValue;
}

export type CategoryKey =
  | 'menu'
  | 'checkout'
  | 'kitchen'
  | 'stock'
  | 'analytics'
  | 'team'
  | 'support'
  | 'volumes';

export const featureCategories: { key: CategoryKey; features: FeatureRow[] }[] = [
  {
    key: 'menu',
    features: [
      { labelKey: 'qrMenu', starter: true, pro: true, business: true, enterprise: true },
      { labelKey: 'onsiteOrders', starter: true, pro: true, business: true, enterprise: true },
      { labelKey: 'takeawayOrders', starter: true, pro: true, business: true, enterprise: true },
      { labelKey: 'deliveryOrders', starter: false, pro: false, business: true, enterprise: true },
      { labelKey: 'roomService', starter: false, pro: false, business: true, enterprise: true },
    ],
  },
  {
    key: 'checkout',
    features: [
      { labelKey: 'pos', starter: true, pro: true, business: true, enterprise: true },
      { labelKey: 'multiCurrency', starter: false, pro: true, business: true, enterprise: true },
      { labelKey: 'tips', starter: false, pro: true, business: true, enterprise: true },
    ],
  },
  {
    key: 'kitchen',
    features: [
      { labelKey: 'kds', starter: false, pro: true, business: true, enterprise: true },
      { labelKey: 'tables', starter: false, pro: true, business: true, enterprise: true },
      { labelKey: 'assignments', starter: false, pro: true, business: true, enterprise: true },
    ],
  },
  {
    key: 'stock',
    features: [
      { labelKey: 'stock', starter: false, pro: true, business: true, enterprise: true },
      { labelKey: 'recipes', starter: false, pro: true, business: true, enterprise: true },
      { labelKey: 'suppliers', starter: false, pro: true, business: true, enterprise: true },
      { labelKey: 'restockAlerts', starter: false, pro: true, business: true, enterprise: true },
    ],
  },
  {
    key: 'analytics',
    features: [
      { labelKey: 'dashboard', starter: true, pro: true, business: true, enterprise: true },
      { labelKey: 'salesReports', starter: false, pro: true, business: true, enterprise: true },
      { labelKey: 'bestSellers', starter: false, pro: true, business: true, enterprise: true },
      {
        labelKey: 'advancedReports',
        starter: false,
        pro: false,
        business: true,
        enterprise: true,
      },
      {
        labelKey: 'multiSiteReports',
        starter: false,
        pro: false,
        business: true,
        enterprise: true,
      },
    ],
  },
  {
    key: 'team',
    features: [
      {
        labelKey: 'establishments',
        starter: { kind: 'text', value: '1' },
        pro: { kind: 'text', value: '2' },
        business: { kind: 'text', value: '10' },
        enterprise: { kind: 'unlimited' },
      },
      {
        labelKey: 'admins',
        starter: { kind: 'text', value: '1' },
        pro: { kind: 'text', value: '2' },
        business: { kind: 'unlimited' },
        enterprise: { kind: 'unlimited' },
      },
      {
        labelKey: 'staff',
        starter: { kind: 'text', value: '3' },
        pro: { kind: 'text', value: '15' },
        business: { kind: 'unlimited' },
        enterprise: { kind: 'unlimited' },
      },
    ],
  },
  {
    key: 'support',
    features: [
      { labelKey: 'email', starter: true, pro: true, business: true, enterprise: true },
      {
        labelKey: 'whatsapp',
        starter: false,
        pro: { kind: 'text', value: 'whatsappPro' },
        business: { kind: 'text', value: 'whatsappBusiness' },
        enterprise: { kind: 'text', value: 'whatsappEnterprise' },
      },
      { labelKey: 'manager', starter: false, pro: false, business: false, enterprise: true },
      {
        labelKey: 'sla',
        starter: false,
        pro: false,
        business: false,
        enterprise: { kind: 'text', value: '99.9%' },
      },
    ],
  },
  {
    key: 'volumes',
    features: [
      {
        labelKey: 'monthlyOrders',
        starter: { kind: 'text', value: '500' },
        pro: { kind: 'text', value: '3 000' },
        business: { kind: 'text', value: '20 000' },
        enterprise: { kind: 'unlimited' },
      },
      {
        labelKey: 'menus',
        starter: { kind: 'unlimited' },
        pro: { kind: 'unlimited' },
        business: { kind: 'unlimited' },
        enterprise: { kind: 'unlimited' },
      },
      {
        labelKey: 'items',
        starter: { kind: 'unlimited' },
        pro: { kind: 'unlimited' },
        business: { kind: 'unlimited' },
        enterprise: { kind: 'unlimited' },
      },
    ],
  },
];

export const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;
