import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Salons de Coiffure & Beauté — Digitalisez vos prestations',
  description:
    'Solution complète pour salons : catalogue de prestations, gestion des rendez-vous, suivi client et analytics en temps réel.',
};

export default function SalonsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
