import type { Metadata } from 'next';
import VideoHero from '@/components/marketing/VideoHero';
import ProductShowcase from '@/components/marketing/ProductShowcase';
import IndustrySection from '@/components/marketing/IndustrySection';
import PhoneAnimation from '@/components/marketing/PhoneAnimation';
import SegmentsSection from '@/components/marketing/SegmentsSection';
import FeaturesShowcase from '@/components/marketing/FeaturesShowcase';
import SocialProof from '@/components/marketing/SocialProof';
import CTASection from '@/components/marketing/CTASection';

export const revalidate = 3600; // ISR: regenerate every hour

export const metadata: Metadata = {
  title: 'Attabl - Menu digital & gestion pour la restauration',
  description:
    "La plateforme tout-en-un pour la restauration et l'hôtellerie. Menu, commandes, stock, analytics en temps réel.",
  openGraph: {
    title: 'Attabl - Petit comptoir ou grande enseigne',
    description: 'Menu, commandes, stock - tout piloté depuis un seul outil.',
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
