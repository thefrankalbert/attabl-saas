import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { MARKETING_CLIENT_NAMESPACES, pickMessages } from '@/i18n/client-messages';
import Header from '@/components/marketing/Header';
import Footer from '@/components/marketing/Footer';

export const revalidate = 3600; // ISR: regenerate every hour

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com'),
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

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';

// Static Organization structured data (not user content) for rich results.
const organizationLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Attabl',
  url: BASE_URL,
  description:
    'Menu digital, commandes, stock et rapports en temps reel. Pour restaurants et hotels.',
  email: 'contact@attabl.com',
  image: `${BASE_URL}/opengraph-image`,
  areaServed: ['Burkina Faso', "Cote d'Ivoire", 'Senegal', 'Cameroun', 'Gabon', 'Tchad', 'Congo'],
};

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Only the messages the marketing client components read (see
  // src/i18n/client-messages.ts): the full catalog was three quarters of the HTML.
  const messages = pickMessages(await getMessages(), MARKETING_CLIENT_NAMESPACES);

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="marketing-shell overflow-x-clip bg-white font-[family-name:var(--font-geist-sans)] text-zinc-950 antialiased dark:bg-zinc-950 dark:text-zinc-50">
        <script
          type="application/ld+json"
          // Static, app-controlled data - safe to inline (not user-generated).
          // Escape "<" so no string could ever break out of the script tag.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationLd).replace(/</g, '\\u003c'),
          }}
        />
        <Header />
        <main>{children}</main>
        <Footer />
      </div>
    </NextIntlClientProvider>
  );
}
