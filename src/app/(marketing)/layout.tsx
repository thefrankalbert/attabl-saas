import type { Metadata } from 'next';
import Header from '@/components/marketing/Header';
import Footer from '@/components/marketing/Footer';

export const metadata: Metadata = {
  title: {
    template: '%s | ATTABL',
    default: 'ATTABL — Menu Digital & Gestion pour Restaurants',
  },
  description:
    'La plateforme tout-en-un pour digitaliser votre restaurant, hotel ou bar. Menu QR code, commandes, stock, analytics en temps reel.',
  openGraph: {
    siteName: 'ATTABL',
    type: 'website',
    locale: 'fr_FR',
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
