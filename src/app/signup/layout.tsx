import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { AUTH_CLIENT_NAMESPACES, pickMessages } from '@/i18n/client-messages';
import '../../styles/auth-theme.css';

export const metadata: Metadata = {
  title: 'Créer un compte - ATTABL',
  description: 'Créez votre compte ATTABL et digitalisez votre activité en quelques minutes.',
  robots: { index: false, follow: false },
};

export default async function SignupLayout({ children }: { children: React.ReactNode }) {
  // Only the auth messages, not the whole catalog (see src/i18n/client-messages.ts).
  const messages = pickMessages(await getMessages(), AUTH_CLIENT_NAMESPACES);
  return (
    <NextIntlClientProvider messages={messages}>
      <div className="h-full overflow-y-auto">{children}</div>
    </NextIntlClientProvider>
  );
}
