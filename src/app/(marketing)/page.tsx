import type { Metadata } from 'next';
import VideoHero from '@/components/marketing/VideoHero';
import ProductShowcase from '@/components/marketing/ProductShowcase';
import IndustrySection from '@/components/marketing/IndustrySection';
import PhoneAnimation from '@/components/marketing/PhoneAnimation';
import SegmentsSection from '@/components/marketing/SegmentsSection';
import FeaturesShowcase from '@/components/marketing/FeaturesShowcase';
import SocialProof from '@/components/marketing/SocialProof';
import CTASection from '@/components/marketing/CTASection';

export const metadata: Metadata = {
  title: 'Attabl — Menu digital & gestion pour restaurants',
  description:
    'La plateforme tout-en-un pour digitaliser votre établissement. Menu, commandes, stock, analytics — en temps réel.',
  openGraph: {
    title: 'Attabl — Votre établissement. Votre menu. Votre contrôle.',
    description:
      "Menu digital, commandes, stock — tout ce qu'il faut pour gérer votre activité avec précision.",
    type: 'website',
  },
};

export default function HomePage() {
  return (
    <>
      <VideoHero />
      <ProductShowcase />
      <SegmentsSection />
      <PhoneAnimation />
      <IndustrySection />
      <FeaturesShowcase />
      <SocialProof />
      <CTASection />
    </>
  );
}
