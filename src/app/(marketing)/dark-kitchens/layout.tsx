import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dark Kitchens — Gestion multi-marques',
  description:
    'Gerez plusieurs marques virtuelles depuis une seule cuisine. Commandes, menus et analytics par marque.',
};

export default function DarkKitchensLayout({ children }: { children: React.ReactNode }) {
  return children;
}
