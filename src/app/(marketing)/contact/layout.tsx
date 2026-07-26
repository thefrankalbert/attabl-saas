import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contact');
  return { title: `${t('heroTitle')} - Attabl`, description: t('heroSubtitle') };
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
