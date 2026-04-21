import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing.legal');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function LegalPage() {
  const t = await getTranslations('marketing.legal');
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-8">{t('heading')}</h1>

      <div className="prose prose-neutral max-w-none space-y-6 text-neutral-600 dark:text-neutral-400">
        <p className="text-sm text-neutral-400 dark:text-neutral-500">{t('lastUpdate')}</p>

        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mt-8">
          {t('section1Title')}
        </h2>
        <p>{t('section1Body')}</p>

        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mt-8">
          {t('section2Title')}
        </h2>
        <p>{t('section2Body')}</p>

        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mt-8">
          {t('section3Title')}
        </h2>
        <p>
          {t('section3Body')}{' '}
          <a
            href="/pricing"
            className="text-neutral-900 dark:text-white font-semibold hover:underline"
          >
            {t('section3Link')}
          </a>
          {t('section3BodyCont')}
        </p>

        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mt-8">
          {t('section4Title')}
        </h2>
        <p>{t('section4Body')}</p>

        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mt-8">
          {t('section5Title')}
        </h2>
        <p>
          {t('section5Body')}{' '}
          <a
            href="mailto:contact@attabl.com"
            className="text-neutral-900 dark:text-white font-semibold hover:underline"
          >
            contact@attabl.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
