import { NextIntlClientProvider } from 'next-intl';

// The root layout only sends the messages of its own client components; this
// area keeps the full catalog (see src/i18n/client-messages.ts).
export default function OfflineLayout({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
