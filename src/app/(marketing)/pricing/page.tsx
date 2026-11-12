'use client';

import { useState, useEffect } from 'react';
import { initAbVariants } from '@/lib/ab-testing';
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

  // Pose le cookie de la duree d'essai (A/B), que l'inscription lit ensuite.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    initAbVariants({ trial: params.get('ab_trial') });
  }, []);

  return (
    <>
      <PricingHero effectivePeriod={period} setPeriod={setPeriod} />
      <PlanCards effectivePeriod={period} />
      <TrialBand />
      <FeatureComparison />
      <CostOverThreeYears />
      <IncludedEverywhere />
      <WhichPlan />
      <FaqSection />
    </>
  );
}
