import { NextIntlClientProvider } from 'next-intl';
// Toutes les classes de l'application (la feuille racine ne porte que celles du site public).
import '@/styles/app.css';

// The root layout only sends the messages of its own client components; this
// area keeps the full catalog (see src/i18n/client-messages.ts).
export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
