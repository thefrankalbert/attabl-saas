import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nouveautes — Dernieres mises a jour',
  description: 'Decouvrez les nouvelles fonctionnalites et ameliorations de la plateforme ATTABL.',
};

export default function NouveautesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
