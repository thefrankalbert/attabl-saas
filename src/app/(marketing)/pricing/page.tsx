'use client';

import { Fragment, useState, useEffect, useSyncExternalStore } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  Check,
  ChevronDown,
  CreditCard,
  Crown,
  Minus,
  Zap,
  Building2,
  Phone,
  Users,
  BarChart3,
  UtensilsCrossed,
  Star,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SinglePricingCard, type Testimonial } from '@/components/ui/single-pricing-card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { TcoComparisonTable } from '@/components/marketing/TcoComparisonTable';
import {
  initAbVariants,
  subscribeAbVariants,
  getAbVariantsSnapshot,
  getAbVariantsServerSnapshot,
} from '@/lib/ab-testing';

type BillingPeriod = 'monthly' | 'semiannual' | 'yearly';

type ComparisonValue = boolean | { kind: 'unlimited' } | { kind: 'text'; value: string };

interface FeatureRow {
  labelKey: string;
  starter: ComparisonValue;
  pro: ComparisonValue;
  business: ComparisonValue;
  enterprise: ComparisonValue;
}

type CategoryKey =
  | 'menu'
  | 'checkout'
  | 'kitchen'
  | 'stock'
  | 'analytics'
  | 'team'
  | 'support'
  | 'volumes';

const featureCategories: { key: CategoryKey; features: FeatureRow[] }[] = [
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
      { labelKey: 'mobileMoney', starter: false, pro: true, business: true, enterprise: true },
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

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800">
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left h-auto px-0 hover:bg-transparent"
      >
        <span className="font-semibold text-neutral-900 dark:text-white text-sm sm:text-base pr-4">
          {question}
        </span>
        <ChevronDown
          className={cn(
            'w-5 h-5 text-neutral-400 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </Button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          open ? 'max-h-40 pb-5' : 'max-h-0',
        )}
      >
        <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">{answer}</p>
      </div>
    </div>
  );
}

function FeatureCell({
  value,
  unlimitedLabel,
  supportLabels,
}: {
  value: ComparisonValue;
  unlimitedLabel: string;
  supportLabels: {
    whatsappPro: string;
    whatsappBusiness: string;
    whatsappEnterprise: string;
  };
}) {
  if (value === true) return <Check className="w-4 h-4 text-green-600 mx-auto" />;
  if (value === false)
    return <Minus className="w-4 h-4 text-neutral-300 dark:text-neutral-600 mx-auto" />;
  if ('kind' in value) {
    if (value.kind === 'unlimited') {
      return (
        <span className="text-xs font-medium text-neutral-900 dark:text-white">
          {unlimitedLabel}
        </span>
      );
    }
    // text kind: may be a direct value or a support label key
    const v = value.value;
    const resolved =
      v === 'whatsappPro'
        ? supportLabels.whatsappPro
        : v === 'whatsappBusiness'
          ? supportLabels.whatsappBusiness
          : v === 'whatsappEnterprise'
            ? supportLabels.whatsappEnterprise
            : v;
    return <span className="text-xs font-medium text-neutral-900 dark:text-white">{resolved}</span>;
  }
  return null;
}

export default function PricingPage() {
  const t = useTranslations('marketing.pricing');
  const locale = useLocale();
  const [period, setPeriod] = useState<BillingPeriod>('monthly');

  const abVariants = useSyncExternalStore(
    subscribeAbVariants,
    getAbVariantsSnapshot,
    getAbVariantsServerSnapshot,
  );
  const showSemiannual = abVariants.toggle === '3';
  const effectivePeriod: BillingPeriod =
    !showSemiannual && period === 'semiannual' ? 'monthly' : period;

  // Initialise AB cookies once on mount; notifies the store, which triggers
  // useSyncExternalStore to re-read. No setState called here.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    initAbVariants({
      trial: params.get('ab_trial'),
      toggle: params.get('ab_toggle'),
    });
  }, []);

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat(locale).format(price);
  };

  const starterPrice =
    effectivePeriod === 'yearly' ? 31200 : effectivePeriod === 'semiannual' ? 33150 : 39000;
  const proPrice =
    effectivePeriod === 'yearly' ? 63200 : effectivePeriod === 'semiannual' ? 67150 : 79000;
  const businessPrice =
    effectivePeriod === 'yearly' ? 119200 : effectivePeriod === 'semiannual' ? 126650 : 149000;

  const priceSuffix = t('priceSuffix');

  const testimonials: Testimonial[] = [
    {
      id: 1,
      name: t('testimonials.t1.name'),
      role: t('testimonials.t1.role'),
      company: t('testimonials.t1.company'),
      content: t('testimonials.t1.content'),
      rating: 5,
      avatar:
        'https://images.unsplash.com/photo-1589156280159-27698a70f29e?w=80&h=80&fit=crop&crop=face',
    },
    {
      id: 2,
      name: t('testimonials.t2.name'),
      role: t('testimonials.t2.role'),
      company: t('testimonials.t2.company'),
      content: t('testimonials.t2.content'),
      rating: 5,
      avatar:
        'https://images.unsplash.com/photo-1611432579699-484f7990b127?w=80&h=80&fit=crop&crop=face',
    },
    {
      id: 3,
      name: t('testimonials.t3.name'),
      role: t('testimonials.t3.role'),
      company: t('testimonials.t3.company'),
      content: t('testimonials.t3.content'),
      rating: 5,
      avatar:
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=80&h=80&fit=crop&crop=face',
    },
    {
      id: 4,
      name: t('testimonials.t4.name'),
      role: t('testimonials.t4.role'),
      company: t('testimonials.t4.company'),
      content: t('testimonials.t4.content'),
      rating: 5,
      avatar:
        'https://images.unsplash.com/photo-1523824921871-d6f1a15151f1?w=80&h=80&fit=crop&crop=face',
    },
  ];

  const planNames = ['STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];

  const supportLabels = {
    whatsappPro: t('comparison.categories.support.features.whatsappPro'),
    whatsappBusiness: t('comparison.categories.support.features.whatsappBusiness'),
    whatsappEnterprise: t('comparison.categories.support.features.whatsappEnterprise'),
  };
  const unlimitedLabel = t('comparison.unlimited');

  return (
    <>
      {/* Hero */}
      <section className="bg-white dark:bg-neutral-950 pt-20 lg:pt-28 pb-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="font-[family-name:var(--font-sora)] text-4xl sm:text-5xl font-bold text-neutral-900 dark:text-white">
              {t('hero.title')}
            </h1>
            <p className="text-lg text-neutral-500 dark:text-neutral-400 mt-4">
              {t('hero.subtitle')}
            </p>

            {/* Billing toggle */}
            <div className="inline-flex bg-neutral-100 dark:bg-neutral-800 rounded-full p-1 mt-8">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPeriod('monthly')}
                className={cn(
                  'px-5 py-2 text-sm font-medium transition-all rounded-full h-auto',
                  effectivePeriod === 'monthly'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500 dark:text-neutral-400 hover:bg-transparent',
                )}
              >
                {t('billing.monthly')}
              </Button>
              {showSemiannual && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPeriod('semiannual')}
                  className={cn(
                    'px-5 py-2 text-sm font-medium transition-all rounded-full h-auto',
                    effectivePeriod === 'semiannual'
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                      : 'text-neutral-500 dark:text-neutral-400 hover:bg-transparent',
                  )}
                >
                  {t('billing.semiannual')}
                  <span className="ml-1.5 text-xs text-green-600 font-semibold">
                    {t('billing.semiannualDiscount')}
                  </span>
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPeriod('yearly')}
                className={cn(
                  'px-5 py-2 text-sm font-medium transition-all rounded-full h-auto',
                  effectivePeriod === 'yearly'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                    : 'text-neutral-500 dark:text-neutral-400 hover:bg-transparent',
                )}
              >
                {t('billing.yearly')}
                <span className="ml-1.5 text-xs text-green-600 font-semibold">
                  {t('billing.yearlyDiscount')}
                </span>
              </Button>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-3">
              {t('billing.noCommitment')}
            </p>
          </div>
        </div>
      </section>

      {/* Plan Cards */}
      <section className="bg-white dark:bg-neutral-950 pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          {/* STARTER */}
          <SinglePricingCard
            badge={{ icon: Zap, text: t('plans.starter.badge') }}
            title={t('plans.starter.title')}
            subtitle={t('plans.starter.subtitle')}
            price={{
              current: `${formatPrice(starterPrice)} ${priceSuffix}`,
              original:
                effectivePeriod !== 'monthly' ? `${formatPrice(39000)} ${priceSuffix}` : undefined,
              discount:
                effectivePeriod === 'yearly'
                  ? t('billing.yearlyDiscount')
                  : effectivePeriod === 'semiannual'
                    ? t('billing.semiannualDiscount')
                    : undefined,
            }}
            benefits={[
              { text: t('plans.starter.benefits.b1'), icon: UtensilsCrossed },
              { text: t('plans.starter.benefits.b2'), icon: CreditCard },
              { text: t('plans.starter.benefits.b3'), icon: Users },
              { text: t('plans.starter.benefits.b4'), icon: Phone },
            ]}
            features={[
              { text: t('plans.starter.features.f1') },
              { text: t('plans.starter.features.f2') },
              { text: t('plans.starter.features.f3') },
              { text: t('plans.starter.features.f4') },
              { text: t('plans.starter.features.f5') },
            ]}
            featuresIcon={Check}
            featuresTitle={t('plans.starter.featuresTitle')}
            primaryButton={{ text: t('plans.starter.button'), href: '/signup' }}
            testimonials={[testimonials[0], testimonials[1]]}
            testimonialRotationSpeed={6000}
          />

          {/* PRO */}
          <SinglePricingCard
            badge={{ icon: Crown, text: t('plans.pro.badge') }}
            title={t('plans.pro.title')}
            subtitle={t('plans.pro.subtitle')}
            popular
            price={{
              current: `${formatPrice(proPrice)} ${priceSuffix}`,
              original:
                effectivePeriod !== 'monthly' ? `${formatPrice(79000)} ${priceSuffix}` : undefined,
              discount:
                effectivePeriod === 'yearly'
                  ? t('billing.yearlyDiscount')
                  : effectivePeriod === 'semiannual'
                    ? t('billing.semiannualDiscount')
                    : undefined,
            }}
            benefits={[
              { text: t('plans.pro.benefits.b1'), icon: Star },
              { text: t('plans.pro.benefits.b2'), icon: BarChart3 },
              { text: t('plans.pro.benefits.b3'), icon: Shield },
              { text: t('plans.pro.benefits.b4'), icon: Phone },
            ]}
            features={[
              { text: t('plans.pro.features.f1') },
              { text: t('plans.pro.features.f2') },
              { text: t('plans.pro.features.f3') },
              { text: t('plans.pro.features.f4') },
              { text: t('plans.pro.features.f5') },
              { text: t('plans.pro.features.f6') },
              { text: t('plans.pro.features.f7') },
              { text: t('plans.pro.features.f8') },
              { text: t('plans.pro.features.f9') },
              { text: t('plans.pro.features.f10') },
            ]}
            featuresIcon={Check}
            featuresTitle={t('plans.pro.featuresTitle')}
            primaryButton={{ text: t('plans.pro.button'), href: '/signup' }}
            testimonials={testimonials}
            testimonialRotationSpeed={5000}
          />

          {/* BUSINESS */}
          <SinglePricingCard
            badge={{ icon: Building2, text: t('plans.business.badge') }}
            title={t('plans.business.title')}
            subtitle={t('plans.business.subtitle')}
            price={{
              current: `${formatPrice(businessPrice)} ${priceSuffix}`,
              original:
                effectivePeriod !== 'monthly' ? `${formatPrice(149000)} ${priceSuffix}` : undefined,
              discount:
                effectivePeriod === 'yearly'
                  ? t('billing.yearlyDiscount')
                  : effectivePeriod === 'semiannual'
                    ? t('billing.semiannualDiscount')
                    : undefined,
            }}
            benefits={[
              { text: t('plans.business.benefits.b1'), icon: Building2 },
              { text: t('plans.business.benefits.b2'), icon: UtensilsCrossed },
              { text: t('plans.business.benefits.b3'), icon: BarChart3 },
              { text: t('plans.business.benefits.b4'), icon: Phone },
            ]}
            features={[
              { text: t('plans.business.features.f1') },
              { text: t('plans.business.features.f2') },
              { text: t('plans.business.features.f3') },
              { text: t('plans.business.features.f4') },
              { text: t('plans.business.features.f5') },
              { text: t('plans.business.features.f6') },
              { text: t('plans.business.features.f7') },
            ]}
            featuresIcon={Check}
            featuresTitle={t('plans.business.featuresTitle')}
            primaryButton={{ text: t('plans.business.primaryButton'), href: '/signup' }}
            secondaryButton={{ text: t('plans.business.secondaryButton'), href: '/contact' }}
            testimonials={[testimonials[2], testimonials[3]]}
            testimonialRotationSpeed={6000}
          />

          {/* ENTERPRISE */}
          <SinglePricingCard
            badge={{ icon: Crown, text: t('plans.enterprise.badge') }}
            title={t('plans.enterprise.title')}
            subtitle={t('plans.enterprise.subtitle')}
            price={{ current: t('customPrice') }}
            benefits={[
              { text: t('plans.enterprise.benefits.b1'), icon: Building2 },
              { text: t('plans.enterprise.benefits.b2'), icon: Shield },
              { text: t('plans.enterprise.benefits.b3'), icon: Users },
              { text: t('plans.enterprise.benefits.b4'), icon: Phone },
            ]}
            features={[
              { text: t('plans.enterprise.features.f1') },
              { text: t('plans.enterprise.features.f2') },
              { text: t('plans.enterprise.features.f3') },
              { text: t('plans.enterprise.features.f4') },
              { text: t('plans.enterprise.features.f5') },
              { text: t('plans.enterprise.features.f6') },
            ]}
            featuresIcon={Check}
            featuresTitle={t('plans.enterprise.featuresTitle')}
            primaryButton={{ text: t('plans.enterprise.button'), href: '/contact' }}
            testimonials={[testimonials[2]]}
            testimonialRotationSpeed={8000}
          />
        </div>
      </section>

      {/* TCO Comparison */}
      <TcoComparisonTable />

      {/* Feature Comparison Grid */}
      <section className="bg-neutral-50 dark:bg-neutral-900 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-[family-name:var(--font-sora)] text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white text-center mb-12">
            {t('comparison.title')}
          </h2>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 border-neutral-200 dark:border-neutral-700">
                  <TableHead className="text-left py-4 pr-4 text-sm font-medium text-neutral-500 dark:text-neutral-400 w-[40%]">
                    {t('comparison.featureColumn')}
                  </TableHead>
                  {planNames.map((name) => (
                    <TableHead
                      key={name}
                      className="text-center py-4 px-2 text-sm font-bold text-neutral-900 dark:text-white w-[15%]"
                    >
                      {name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {featureCategories.map((cat) => (
                  <Fragment key={cat.key}>
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="pt-8 pb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
                      >
                        {t(`comparison.categories.${cat.key}.title`)}
                      </TableCell>
                    </TableRow>
                    {cat.features.map((f) => (
                      <TableRow
                        key={f.labelKey}
                        className="border-b border-neutral-100 dark:border-neutral-800"
                      >
                        <TableCell className="py-3 pr-4 text-sm text-neutral-700 dark:text-neutral-300">
                          {t(`comparison.categories.${cat.key}.features.${f.labelKey}`)}
                        </TableCell>
                        <TableCell className="py-3 px-2 text-center">
                          <FeatureCell
                            value={f.starter}
                            unlimitedLabel={unlimitedLabel}
                            supportLabels={supportLabels}
                          />
                        </TableCell>
                        <TableCell className="py-3 px-2 text-center">
                          <FeatureCell
                            value={f.pro}
                            unlimitedLabel={unlimitedLabel}
                            supportLabels={supportLabels}
                          />
                        </TableCell>
                        <TableCell className="py-3 px-2 text-center">
                          <FeatureCell
                            value={f.business}
                            unlimitedLabel={unlimitedLabel}
                            supportLabels={supportLabels}
                          />
                        </TableCell>
                        <TableCell className="py-3 px-2 text-center">
                          <FeatureCell
                            value={f.enterprise}
                            unlimitedLabel={unlimitedLabel}
                            supportLabels={supportLabels}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white dark:bg-neutral-950 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-[family-name:var(--font-sora)] text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white mb-8 text-center">
            {t('faq.title')}
          </h2>
          <div>
            {FAQ_KEYS.map((k) => (
              <FaqItem
                key={k}
                question={t(`faq.items.${k}.question`)}
                answer={t(`faq.items.${k}.answer`)}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
