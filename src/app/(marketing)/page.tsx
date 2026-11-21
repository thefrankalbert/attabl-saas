import type { Metadata } from 'next';
import { HomeHero } from '@/components/marketing/home/HomeHero';
import { HomeMosaic } from '@/components/marketing/home/HomeMosaic';
import { HomeRange } from '@/components/marketing/home/HomeRange';
import { HomeLocal } from '@/components/marketing/home/HomeLocal';
import { HomeAudience } from '@/components/marketing/home/HomeAudience';
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
      <HomeMosaic />
      <HomeRange />
      <HomeLocal />
      <HomeAudience />
      <PricingTeaser />
      <HomeFaq />
      <FinalCta />
    </>
  );
}
