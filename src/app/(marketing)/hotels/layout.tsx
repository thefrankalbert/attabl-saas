import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hotels — Room Service & Restauration digitale',
  description:
    'Room service digital, QR code en chambre, gestion multi-espaces restaurant/bar/piscine pour hotels et resorts.',
};

export default function HotelsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
