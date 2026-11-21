import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function FinalCta() {
  const t = await getTranslations('marketing.home.finalCta');

  return (
    <section className="bg-gris text-encre dark:text-white" aria-labelledby="fin-titre">
      <div className="mx-auto max-w-[1440px] px-5 py-20 text-center lg:px-8 lg:py-28">
        <h2
          id="fin-titre"
          className="mx-auto max-w-[26ch] text-balance font-titre text-[40px] leading-[1.03] tracking-[-0.015em] sm:text-[60px]"
        >
          {t('title')}
        </h2>
        <p className="mt-5 text-[17px] text-encre/70 dark:text-white/70">{t('subtitle')}</p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex h-12 items-center justify-center rounded-full bg-encre px-7 text-[16px] font-medium text-white hover:bg-black max-sm:w-full dark:bg-white dark:text-encre dark:hover:bg-white/90"
          >
            {t('ctaPrimary')}
          </Link>
          <a
            href="https://wa.me/237658651050"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center rounded-full border border-encre/30 px-6 text-[16px] font-medium hover:border-encre max-sm:w-full dark:border-white/30 dark:hover:border-white"
          >
            {t('whatsapp')}
          </a>
        </div>
      </div>
    </section>
  );
}
