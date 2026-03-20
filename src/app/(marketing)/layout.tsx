import type { Metadata } from 'next';
import Header from '@/components/marketing/Header';
import Footer from '@/components/marketing/Footer';

export const revalidate = 3600; // ISR: regenerate every hour

export const metadata: Metadata = {
  title: {
    template: '%s | ATTABL',
    default: 'ATTABL - Menu Digital & Gestion pour la Restauration',
  },
  description:
    "La plateforme tout-en-un pour la restauration et l'hôtellerie. Menu, commandes, stock, analytics en temps réel.",
  openGraph: {
    siteName: 'ATTABL',
    type: 'website',
    locale: 'fr_FR',
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
