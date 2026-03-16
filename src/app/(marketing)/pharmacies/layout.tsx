import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pharmacies & Parapharmacies — Digitalisez votre officine',
  description:
    'Solution complète pour pharmacies : catalogue produits, gestion des stocks, suivi fournisseurs et analytics en temps réel.',
};

export default function PharmaciesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
