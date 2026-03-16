import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog — Conseils & Ressources pour Entrepreneurs',
  description:
    'Guides pratiques, conseils et ressources pour digitaliser votre commerce en Afrique. Restauration, retail, services.',
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
