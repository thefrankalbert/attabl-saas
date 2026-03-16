import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Commerces & Épiceries — Digitalisez votre catalogue',
  description:
    'Solution complète pour commerces de détail : catalogue digital, gestion des stocks, caisse POS, suivi fournisseurs en temps réel.',
};

export default function RetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
