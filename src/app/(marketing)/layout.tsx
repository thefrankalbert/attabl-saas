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
    'Menu digital, commandes, stock et analytics en temps réel. Pour restaurants et hôtels.',
  openGraph: {
    siteName: 'ATTABL',
    type: 'website',
    locale: 'fr_FR',
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-neutral-950">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
