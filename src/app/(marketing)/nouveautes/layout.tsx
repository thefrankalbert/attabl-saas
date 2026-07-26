import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing.nouveautes');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

export default function NouveautesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
