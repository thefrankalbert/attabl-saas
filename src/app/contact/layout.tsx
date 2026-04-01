import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact - ATTABL',
  description:
    "Contactez l'équipe ATTABL pour toute question sur notre solution de menu digital et gestion de restaurant.",
  openGraph: {
    title: 'Contact - ATTABL',
    description:
      "Contactez l'équipe ATTABL pour toute question sur notre solution de menu digital et gestion de restaurant.",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
