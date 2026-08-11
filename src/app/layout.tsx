import type { Metadata, Viewport } from 'next';
import {
  geistSans,
  geistMono,
  dmSerifDisplay,
  instrumentSerif,
  inter,
  poppins,
  montserrat,
  playfairDisplay,
  raleway,
  nunito,
  roboto,
  lato,
  openSans,
  sourceSans3,
  sora,
} from './fonts';
import './globals.css';
import { Suspense } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import ScrollRestoration from '@/components/shared/ScrollRestoration';
import { AgentationOverlay } from '@/components/shared/AgentationOverlay';
import { RegisterSW } from '@/components/shared/RegisterSW';
import { cn } from '@/lib/utils';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { headers } from 'next/headers';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#CCFF00',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://attabl.com'),
  applicationName: 'ATTABL',
  title: 'Attabl - Menu digital & gestion pour la restauration',
  description:
    "La plateforme tout-en-un pour la restauration et l'hôtellerie en Afrique. Menu, commandes, stock, analytics en temps réel.",
  manifest: '/manifest.json',
  // Lets iOS Safari (which ignores most of the web manifest) install ATTABL as a
  // full-screen home-screen app - key for the offline tablet use case.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ATTABL',
  },
  formatDetection: {
    telephone: false,
  },
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
  // CSP nonce injected per-request by the middleware (src/proxy.ts: x-csp-nonce).
  // Passed to next-themes so its no-flash inline script carries the nonce and is
  // not blocked by the strict script-src CSP.
  const nonce = (await headers()).get('x-csp-nonce') ?? undefined;

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
            nonce={nonce}
          >
            <Suspense fallback={null}>
              <ScrollRestoration />
            </Suspense>
            {children}
            <Toaster />
            <RegisterSW />
            <AgentationOverlay />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
