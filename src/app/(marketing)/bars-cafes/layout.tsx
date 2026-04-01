import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bars & Cafes - Commandes rapides & Menu digital',
  description:
    'Accelerez le service avec les commandes QR code. Ideal pour bars, cafes, lounges et terrasses.',
};

export default function BarsCafesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
