import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Restaurants — Digitalisez votre carte',
  description:
    'Solution complete pour restaurants : menu digital, commandes en salle, gestion du service, tableau de bord en temps reel.',
};

export default function RestaurantsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
