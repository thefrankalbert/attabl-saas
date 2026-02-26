import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Boulangeries & Patisseries — Vitrine digitale',
  description:
    'Menu digital pour boulangeries et patisseries. Commandes a emporter, gestion des stocks de produits frais.',
};

export default function BoulangeriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
