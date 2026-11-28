import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { AUTH_CLIENT_NAMESPACES, pickMessages } from '@/i18n/client-messages';
import '../../styles/auth-theme.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('unsubscribe');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

export default async function UnsubscribeLayout({ children }: { children: React.ReactNode }) {
  // The auth frame plus the confirm button (see src/i18n/client-messages.ts).
  const messages = pickMessages(await getMessages(), [...AUTH_CLIENT_NAMESPACES, 'unsubscribe']);
  return (
    <NextIntlClientProvider messages={messages}>
      <div className="h-full overflow-y-auto">{children}</div>
    </NextIntlClientProvider>
  );
}
