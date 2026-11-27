import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing.features');
  return {
    alternates: { canonical: '/features' },
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
