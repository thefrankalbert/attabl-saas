'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import {
  initAbVariants,
  subscribeAbVariants,
  getAbVariantsSnapshot,
  getAbVariantsServerSnapshot,
} from '@/lib/ab-testing';
import type { BillingPeriod } from './pricing-data';
import { PricingHero } from './_components/PricingHero';
import { PlanCards } from './_components/PlanCards';
import { TrialBand } from './_components/TrialBand';
import { FeatureComparison } from './_components/FeatureComparison';
import { CostOverThreeYears } from './_components/CostOverThreeYears';
import { IncludedEverywhere } from './_components/IncludedEverywhere';
import { WhichPlan } from './_components/WhichPlan';
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
      <PricingHero
        effectivePeriod={effectivePeriod}
        showSemiannual={showSemiannual}
        setPeriod={setPeriod}
      />
      <PlanCards effectivePeriod={effectivePeriod} />
      <TrialBand />
      <FeatureComparison />
      <CostOverThreeYears />
      <IncludedEverywhere />
      <WhichPlan />
      <FaqSection />
    </>
  );
}
