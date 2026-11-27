import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { AUTH_CLIENT_NAMESPACES, pickMessages } from '@/i18n/client-messages';
import '../../styles/auth-theme.css';

export const metadata: Metadata = {
  title: 'Connexion - ATTABL',
  description: 'Connectez-vous à votre espace ATTABL pour gérer votre activité.',
  robots: { index: false, follow: false },
};

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  // Only the auth messages, not the whole catalog (see src/i18n/client-messages.ts).
  const messages = pickMessages(await getMessages(), AUTH_CLIENT_NAMESPACES);
  return (
    <NextIntlClientProvider messages={messages}>
      <div className="h-full overflow-y-auto">{children}</div>
    </NextIntlClientProvider>
  );
}
