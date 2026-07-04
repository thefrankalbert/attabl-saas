'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { TcoComparisonTable } from '@/components/marketing/TcoComparisonTable';
import {
  initAbVariants,
  subscribeAbVariants,
  getAbVariantsSnapshot,
  getAbVariantsServerSnapshot,
} from '@/lib/ab-testing';
import type { BillingPeriod } from './pricing-data';
import { PricingHero } from './_components/PricingHero';
import { PlanCards } from './_components/PlanCards';
import { FeatureComparison } from './_components/FeatureComparison';
import { FaqSection } from './_components/FaqSection';

export default function PricingPage() {
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

  return (
    <>
      {/* Hero */}
      <PricingHero
        effectivePeriod={effectivePeriod}
        showSemiannual={showSemiannual}
        setPeriod={setPeriod}
      />

      {/* Plan Cards */}
      <PlanCards effectivePeriod={effectivePeriod} />

      {/* TCO Comparison */}
      <TcoComparisonTable />

      {/* Feature Comparison Grid */}
      <FeatureComparison />

      {/* FAQ */}
      <FaqSection />
    </>
  );
}
