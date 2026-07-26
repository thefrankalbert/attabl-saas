import type { Metadata } from 'next';
import { HomeHero } from '@/components/marketing/home/HomeHero';
import { StockFeature } from '@/components/marketing/home/StockFeature';
import { ShowcaseTabs } from '@/components/marketing/home/ShowcaseTabs';
import { AllInOne } from '@/components/marketing/home/AllInOne';
import { PricingTeaser } from '@/components/marketing/home/PricingTeaser';
import { HomeFaq } from '@/components/marketing/home/HomeFaq';
import { FinalCta } from '@/components/marketing/home/FinalCta';

export const revalidate = 3600; // ISR: regenerate every hour

export const metadata: Metadata = {
  title: 'Attabl - Caisse, commandes et stock pour restaurants',
  description:
    "Votre caisse, vos commandes et vos stocks dans une seule application, pensee pour les restaurants et hotels d'Afrique francophone. Essai 14 jours sans carte.",
  openGraph: {
    title: 'Attabl - Caisse, commandes et stock pour restaurants',
    description:
      'Votre caisse, vos commandes et vos stocks dans une seule application. Essai gratuit 14 jours, sans carte bancaire.',
    type: 'website',
  },
};

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <StockFeature />
      <ShowcaseTabs />
      <AllInOne />
      <PricingTeaser />
      <HomeFaq />
      <FinalCta />
    </>
  );
}
