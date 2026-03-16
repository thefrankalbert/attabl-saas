import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Attabl pour les Hôtels - Room service & multi-venues',
  description:
    'Room service digital, QR code en chambre, gestion multi-espaces restaurant/bar/piscine pour hotels et resorts.',
};

export default function HotelsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
