'use client';

import { useTranslations, useLocale } from 'next-intl';
import {
  Check,
  CreditCard,
  Crown,
  Zap,
  Building2,
  Phone,
  Users,
  BarChart3,
  UtensilsCrossed,
  Star,
  Shield,
} from 'lucide-react';
import { SinglePricingCard, type Testimonial } from '@/components/ui/single-pricing-card';
import type { BillingPeriod } from '../pricing-data';

export function PlanCards({ effectivePeriod }: { effectivePeriod: BillingPeriod }) {
  const t = useTranslations('marketing.pricing');
  const locale = useLocale();

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
      avatar: '/avatars/ak.png',
    },
    {
      id: 2,
      name: t('testimonials.t2.name'),
      role: t('testimonials.t2.role'),
      company: t('testimonials.t2.company'),
      content: t('testimonials.t2.content'),
      rating: 5,
      avatar: '/avatars/gm.png',
    },
    {
      id: 3,
      name: t('testimonials.t3.name'),
      role: t('testimonials.t3.role'),
      company: t('testimonials.t3.company'),
      content: t('testimonials.t3.content'),
      rating: 5,
      avatar: '/avatars/id.png',
    },
    {
      id: 4,
      name: t('testimonials.t4.name'),
      role: t('testimonials.t4.role'),
      company: t('testimonials.t4.company'),
      content: t('testimonials.t4.content'),
      rating: 5,
      avatar: '/avatars/fs.png',
    },
  ];

  return (
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
  );
}
