import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog - Conseils & Ressources pour la Restauration',
  description:
    'Guides pratiques, conseils et ressources pour digitaliser votre restaurant ou hôtel en Afrique.',
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
