'use client';

import { Check, ShieldCheck } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { PLAN_AMOUNTS } from '@/lib/stripe/pricing';
import { PLAN_NAMES } from '@/lib/plans/features';
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';

type SelfServicePlan = Exclude<SubscriptionPlan, 'enterprise'>;

const PLAN_FEATURES: Record<SelfServicePlan, string[]> = {
  starter: [
    'feature1Space',
    'featureUnlimitedMenu',
    'featureBasicPOS',
    'featureHdPhotos',
    'featureEmailSupport',
  ],
  pro: [
    'feature1Space',
    'featureFullPOS',
    'featureKDS',
    'featureInventory',
    'featureTableOrder',
    'featureAdvancedStats',
  ],
  business: [
    'feature10Spaces',
    'featureAllProFeatures',
    'featureRoomService',
    'featureDelivery',
    'featureAIAnalytics',
    'featureUnlimitedStaff',
  ],
};

interface CheckoutLeftPanelProps {
  plan: SelfServicePlan;
  interval: BillingInterval;
}

export function CheckoutLeftPanel({ plan, interval }: CheckoutLeftPanelProps) {
  const t = useTranslations('admin');
  const tc = useTranslations('checkout');
  const locale = useLocale();

  const price = PLAN_AMOUNTS[plan][interval].toLocaleString(locale);
  const planName = PLAN_NAMES[plan];
  const features = PLAN_FEATURES[plan];

  const intervalLabel: Record<BillingInterval, string> = {
    monthly: tc('page.monthly'),
    yearly: tc('page.yearly'),
    semiannual: tc('page.semiannual'),
  };

  return (
    <div className="flex flex-col justify-between bg-[#0a0a0a] text-[#f5f5f4] p-8 md:p-12 md:w-[42%] md:min-h-screen">
      {/* Logo */}
      <div>
        <div className="flex items-center gap-2 mb-12">
          <div className="w-8 h-8 rounded-lg bg-[#c2f542] flex items-center justify-center shrink-0">
            <span className="text-[#0a0a0a] font-black text-sm leading-none">A</span>
          </div>
          <span className="text-[#f5f5f4] font-bold text-lg tracking-tight">ATTABL</span>
        </div>

        {/* Plan info */}
        <p className="text-sm text-[#a8a29e] mb-2">{tc('page.subscribingTo')}</p>
        <h1 className="text-3xl font-bold text-[#f5f5f4] mb-1">ATTABL {planName}</h1>

        {/* Price */}
        <div className="flex items-baseline gap-1 mt-4 mb-8">
          <span className="text-4xl font-bold tabular-nums">{price}</span>
          <span className="text-[#a8a29e] text-sm ml-1">FCFA {intervalLabel[interval]}</span>
        </div>

        {/* Features */}
        <ul className="space-y-3">
          {features.map((key) => (
            <li key={key} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-[#c2f542]/15 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3 h-3 text-[#c2f542]" />
              </div>
              <span className="text-sm text-[#d4d0cc]">
                {t(`subscription.${key}` as Parameters<typeof t>[0])}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Security badge */}
      <div className="mt-12 flex items-center gap-2 text-[#6b6560]">
        <ShieldCheck className="w-4 h-4 shrink-0" />
        <p className="text-xs">{tc('page.securePayment')}</p>
      </div>
    </div>
  );
}
