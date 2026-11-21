import { getTranslations } from 'next-intl/server';

const ITEM_KEYS = ['restaurants', 'hotels', 'bars'] as const;

export async function HomeAudience() {
  const t = await getTranslations('marketing.home.audience');

  return (
    <section
      className="mx-auto max-w-[1440px] px-5 py-20 text-encre lg:px-8 lg:py-28 dark:text-white"
      aria-labelledby="qui-titre"
    >
      <p className="surtitre text-encre/60 dark:text-white/60">{t('eyebrow')}</p>
      <h2
        id="qui-titre"
        className="mt-4 max-w-[20ch] font-titre text-[36px] leading-[1.05] tracking-[-0.015em] sm:text-[52px]"
      >
        {t('title')}
      </h2>
      <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
        {ITEM_KEYS.map((k) => (
          <div key={k} className="border-t border-encre pt-6 dark:border-white">
            <h3 className="text-[22px] font-medium tracking-[-0.01em]">{t(`items.${k}.title`)}</h3>
            <p className="mt-3 text-[16px] leading-[1.6] text-encre/70 dark:text-white/70">
              {t(`items.${k}.body`)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
