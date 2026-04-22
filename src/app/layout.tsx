import type { Metadata, Viewport } from 'next';
import {
  Geist,
  Geist_Mono,
  DM_Serif_Display,
  Instrument_Serif,
  Inter,
  Poppins,
  Montserrat,
  Playfair_Display,
  Raleway,
  Nunito,
  Roboto,
  Lato,
  Open_Sans,
  Source_Sans_3,
  Sora,
} from 'next/font/google';
import './globals.css';
import { Suspense } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import ScrollRestoration from '@/components/shared/ScrollRestoration';
import { AgentationOverlay } from '@/components/shared/AgentationOverlay';
import { cn } from '@/lib/utils';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const dmSerifDisplay = DM_Serif_Display({
  variable: '--font-dm-serif-display',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
});

// ===== Curated tenant fonts (see src/lib/config/fonts.ts) =====
// All 10 fonts are preloaded here so tenant layouts can swap between them
// by CSS variable without triggering additional network requests.

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const playfairDisplay = Playfair_Display({
  variable: '--font-playfair-display',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const raleway = Raleway({
  variable: '--font-raleway',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const roboto = Roboto({
  variable: '--font-roboto',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

const lato = Lato({
  variable: '--font-lato',
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
});

const openSans = Open_Sans({
  variable: '--font-open-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const sourceSans3 = Source_Sans_3({
  variable: '--font-source-sans-3',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// Sora is the display font used by marketing landing pages, blog articles
// and the i18n nouveautes/features sections via
// `font-[family-name:var(--font-sora)]`. Adding it here ensures the variable
// is defined; otherwise the class silently fell back to the body default.
const sora = Sora({
  variable: '--font-sora',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#CCFF00',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://attabl.com'),
  title: 'Attabl - Menu digital & gestion pour la restauration',
  description:
    "La plateforme tout-en-un pour la restauration et l'hôtellerie en Afrique. Menu, commandes, stock, analytics en temps réel.",
  manifest: '/manifest.json',
  alternates: {
    canonical: '/',
  },
  // Prevent Chrome/Edge auto-translate from mangling the UI (the app handles
  // i18n internally via next-intl, browser translation produces garbage like
  // "Accueil" → "Maison", "Panier" → "Chariot").
  other: {
    google: 'notranslate',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} translate="no" suppressHydrationWarning>
      <body
        className={cn(
          geistSans.variable,
          geistMono.variable,
          dmSerifDisplay.variable,
          instrumentSerif.variable,
          inter.variable,
          poppins.variable,
          montserrat.variable,
          playfairDisplay.variable,
          raleway.variable,
          nunito.variable,
          roboto.variable,
          lato.variable,
          openSans.variable,
          sourceSans3.variable,
          sora.variable,
          'antialiased font-sans',
        )}
        suppressHydrationWarning
      >
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <Suspense fallback={null}>
              <ScrollRestoration />
            </Suspense>
            {children}
            <Toaster />
            <AgentationOverlay />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
