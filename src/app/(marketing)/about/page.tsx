import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing.about');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function AboutPage() {
  const t = await getTranslations('marketing.about');
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-8">{t('heading')}</h1>

      <div className="prose prose-neutral max-w-none space-y-6 text-neutral-600 dark:text-neutral-400">
        <p className="text-lg">{t('intro')}</p>

        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mt-8">
          {t('visionTitle')}
        </h2>
        <p>{t('visionBody')}</p>

        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mt-8">
          {t('techTitle')}
        </h2>
        <p>{t('techBody')}</p>

        <div className="mt-12 flex gap-4">
          <Button asChild>
            <Link href="/contact">{t('contactButton')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/pricing">{t('pricingButton')}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
