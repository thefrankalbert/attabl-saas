import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Attabl - Tarifs simples pour la restauration',
  description:
    'Découvrez nos offres adaptées à chaque établissement. Essentiel dès 39 800 FCFA/mois, Premium dès 79 800 FCFA/mois. Essai gratuit 14 jours.',
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
