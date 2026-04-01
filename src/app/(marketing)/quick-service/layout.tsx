import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Restauration Rapide - Commandes en libre-service',
  description:
    'Bornes de commande digitales, menu QR code, gestion des files. Optimise pour la restauration rapide et le fast-casual.',
};

export default function QuickServiceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
