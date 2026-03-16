import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fast-Food - Rapidité et efficacité',
  description:
    'Solution complète pour fast-food : écran cuisine, gestion des files, bornes de commande, analytics en temps réel.',
};

export default function FastFoodLayout({ children }: { children: React.ReactNode }) {
  return children;
}
