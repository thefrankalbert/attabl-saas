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

  // Le semestriel n'est plus propose sur la page publique (decision produit du
  // 2026-11-06): le selecteur n'offre que Mensuel et Annuel. La periode reste
  // supportee par la facturation et par Stripe pour les abonnes qui l'ont
  // deja - on ne retire que le CHOIX offert aux visiteurs.
  //
  // La page ne lit plus de variante A/B: l'experimentation sur ce selecteur est
  // arretee. L'appel ci-dessous reste necessaire pour poser le cookie de la
  // duree d'essai, que l'inscription lit ensuite.
  const effectivePeriod: BillingPeriod = period;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    initAbVariants({ trial: params.get('ab_trial') });
  }, []);

  return (
    <>
      <PricingHero effectivePeriod={effectivePeriod} setPeriod={setPeriod} />
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
