import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { SITES_CLIENT_NAMESPACES, pickMessages } from '@/i18n/client-messages';
// Toutes les classes de l'application (la feuille racine ne porte que celles du site public).
import '@/styles/app.css';

// Common parent of the convive menu AND the admin dashboard: it only sends what
// its own error/not-found pages read. The admin layout provides the full catalog,
// the storefront layout its own subset (see src/i18n/client-messages.ts).
export default async function SitesLayout({ children }: { children: React.ReactNode }) {
  const messages = pickMessages(await getMessages(), SITES_CLIENT_NAMESPACES);
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
