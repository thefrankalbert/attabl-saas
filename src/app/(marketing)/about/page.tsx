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
    <section className="bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[760px] px-5 pb-24 pt-20 sm:px-7 sm:pt-[88px]">
        <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] text-zinc-950 dark:text-zinc-50">
          {t('heading')}
        </h1>

        <p className="mt-5 text-[19px] leading-[1.5] text-zinc-600 dark:text-zinc-400">
          {t('intro')}
        </p>

        <h2 className="mt-12 text-xl font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
          {t('visionTitle')}
        </h2>
        <p className="mt-3 text-base leading-[1.6] text-zinc-600 dark:text-zinc-400">
          {t('visionBody')}
        </p>

        <h2 className="mt-10 text-xl font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
          {t('techTitle')}
        </h2>
        <p className="mt-3 text-base leading-[1.6] text-zinc-600 dark:text-zinc-400">
          {t('techBody')}
        </p>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/contact"
            className="inline-flex items-center rounded-[10px] bg-zinc-950 px-[26px] py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {t('contactButton')}
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-[10px] border border-zinc-200 bg-white px-[22px] py-3.5 text-[15px] font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            {t('pricingButton')}
          </Link>
        </div>
      </div>
    </section>
  );
}
