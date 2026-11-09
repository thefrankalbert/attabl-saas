import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing.privacy');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations('marketing.privacy');

  return (
    <section className="bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[760px] px-5 pb-24 pt-20 sm:px-7 sm:pt-[88px]">
        <h1 className="text-[36px] font-semibold leading-[1.05] tracking-[-0.03em] text-zinc-950 dark:text-zinc-50">
          {t('heading')}
        </h1>
        <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-500">{t('lastUpdate')}</p>

        <h2 className="mt-10 text-xl font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
          {t('section1Title')}
        </h2>
        <p className="mt-3 text-base leading-[1.6] text-zinc-600 dark:text-zinc-400">
          {t('section1Body')}
        </p>

        <h2 className="mt-10 text-xl font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
          {t('section2Title')}
        </h2>
        <p className="mt-3 text-base leading-[1.6] text-zinc-600 dark:text-zinc-400">
          {t('section2Body')}
        </p>

        <h2 className="mt-10 text-xl font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
          {t('section3Title')}
        </h2>
        <p className="mt-3 text-base leading-[1.6] text-zinc-600 dark:text-zinc-400">
          {t('section3Body')}
        </p>

        <h2 className="mt-10 text-xl font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
          {t('section4Title')}
        </h2>
        <p className="mt-3 text-base leading-[1.6] text-zinc-600 dark:text-zinc-400">
          {t('section4Body')}
        </p>

        <h2 className="mt-10 text-xl font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
          {t('section5Title')}
        </h2>
        <p className="mt-3 text-base leading-[1.6] text-zinc-600 dark:text-zinc-400">
          {t('section5Body')}{' '}
          <a
            href="mailto:contact@attabl.com"
            className="font-medium text-orange-600 hover:underline dark:text-orange-400"
          >
            contact@attabl.com
          </a>
          .
        </p>

        <h2 className="mt-10 text-xl font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
          {t('section6Title')}
        </h2>
        <p className="mt-3 text-base leading-[1.6] text-zinc-600 dark:text-zinc-400">
          {t('section6Body')}
        </p>

        <h2 className="mt-10 text-xl font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
          {t('section7Title')}
        </h2>
        <p className="mt-3 text-base leading-[1.6] text-zinc-600 dark:text-zinc-400">
          {t('section7Body')}
        </p>

        <h2 className="mt-10 text-xl font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
          {t('section8Title')}
        </h2>
        <p className="mt-3 text-base leading-[1.6] text-zinc-600 dark:text-zinc-400">
          {t('section8Body')}
        </p>
      </div>
    </section>
  );
}
