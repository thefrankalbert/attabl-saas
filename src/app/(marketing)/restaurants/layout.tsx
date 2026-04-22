import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Attabl pour les Restaurants - Menu, cuisine, gestion',
  description:
    'Solution complete pour restaurants : menu digital, commandes en salle, gestion du service, tableau de bord en temps réel.',
};

export default function RestaurantsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
