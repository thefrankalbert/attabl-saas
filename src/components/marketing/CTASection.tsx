import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function CTASection() {
  const t = await getTranslations('marketing.home.cta');

  return (
    <section className="bg-neutral-900 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="mx-auto max-w-2xl font-[family-name:var(--font-sora)] text-3xl font-bold text-white sm:text-4xl">
          {t('title')}
        </h2>
        <p className="mt-4 text-neutral-400">{t('subtitle')}</p>
        <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
          <Link
            href="/signup"
            className="inline-block rounded-lg bg-white px-8 py-4 font-semibold text-neutral-900 dark:text-neutral-900 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-200"
          >
            {t('primary')}
          </Link>
          <Link
            href="/contact"
            className="inline-block rounded-lg border border-neutral-600 px-8 py-4 font-semibold text-white transition-colors hover:bg-neutral-800"
          >
            {t('secondary')}
          </Link>
        </div>
        <p className="mt-6 text-sm text-neutral-500">{t('footer')}</p>
      </div>
    </section>
  );
}
