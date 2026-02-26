import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tarifs — Plans Essentiel & Premium',
  description:
    'Decouvrez nos offres adaptees a chaque etablissement. Essentiel des 39 800 FCFA/mois, Premium des 79 800 FCFA/mois. Essai gratuit 14 jours.',
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
