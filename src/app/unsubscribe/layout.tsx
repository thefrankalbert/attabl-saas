import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import '../../styles/auth-theme.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('unsubscribe');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

export default function UnsubscribeLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto">{children}</div>;
}
