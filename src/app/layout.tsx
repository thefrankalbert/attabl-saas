import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, DM_Serif_Display } from 'next/font/google';
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
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={cn(
          geistSans.variable,
          geistMono.variable,
          dmSerifDisplay.variable,
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
