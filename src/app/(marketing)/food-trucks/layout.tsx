import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Food Trucks — Menu mobile & Commandes rapides',
  description:
    'Menu QR code pour food trucks. Commandes rapides, paiement mobile, gestion simplifiee en deplacement.',
};

export default function FoodTrucksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
