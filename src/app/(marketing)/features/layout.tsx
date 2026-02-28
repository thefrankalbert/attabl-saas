import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fonctionnalités — Menu, Commandes, Stock, KDS, POS',
  description:
    'Menu digital bilingue, QR code, commandes en temps réel, gestion de stock, écran cuisine KDS, point de vente POS, rapports analytiques.',
};

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
