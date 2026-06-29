import type { Metadata } from 'next';
import VideoHero from '@/components/marketing/VideoHero';
import ProductShowcase from '@/components/marketing/ProductShowcase';
import PresenceSection from '@/components/marketing/PresenceSection';
import SegmentsSection from '@/components/marketing/SegmentsSection';
import FeaturesShowcase from '@/components/marketing/FeaturesShowcase';
import SocialProof from '@/components/marketing/SocialProof';
import CTASection from '@/components/marketing/CTASection';

export const revalidate = 3600; // ISR: regenerate every hour

export const metadata: Metadata = {
  title: 'Attabl - Votre restaurant digital en 5 minutes',
  description:
    "Menu QR, commandes en temps réel, caisse intégrée. Utilisé par des restaurants au Burkina Faso, Côte d'Ivoire et au Sénégal. Essai gratuit 14 jours.",
  openGraph: {
    title: 'Attabl - Petit comptoir ou grande enseigne. Marquez votre territoire.',
    description:
      'Vos clients commandent depuis leur téléphone. Votre cuisine voit tout en temps réel. Essai gratuit 14 jours.',
    type: 'website',
  },
};

export default function HomePage() {
  return (
    <>
      <VideoHero />
      <ProductShowcase />
      <SegmentsSection />
      <PresenceSection />
      <FeaturesShowcase />
      <SocialProof />
      <CTASection />
    </>
  );
}
