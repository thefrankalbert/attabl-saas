import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

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
          <Link
            href="/contact"
            className="inline-flex items-center rounded-xl bg-neutral-900 dark:bg-white px-6 py-3 text-sm font-semibold text-white dark:text-neutral-900 transition-colors hover:bg-neutral-800 dark:hover:bg-neutral-200"
          >
            {t('contactButton')}
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-6 py-3 text-sm font-semibold text-neutral-900 dark:text-white transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            {t('pricingButton')}
          </Link>
        </div>
      </div>
    </div>
  );
}
