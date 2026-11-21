import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { RangeCardStack, type RangeCard } from './RangeCardStack';

const CARD_KEYS = ['comptoir', 'service', 'cuisine', 'bureau'] as const;
const POINT_KEYS = ['p1', 'p2', 'p3'] as const;

export async function HomeRange() {
  const t = await getTranslations('marketing.home.range');
  const cards: RangeCard[] = CARD_KEYS.map((k) => ({
    key: k,
    name: t(`cards.${k}.name`),
    title: t(`cards.${k}.title`),
    body: t(`cards.${k}.body`),
    points: POINT_KEYS.map((p) => t(`cards.${k}.points.${p}`)),
    cta: t(`cards.${k}.cta`),
    imageAlt: t(`cards.${k}.imageAlt`),
  }));

  return (
    <section
      className="bg-gris py-20 text-encre lg:py-28 dark:text-white"
      aria-labelledby="gamme-titre"
    >
      <div className="mx-auto max-w-[1440px] px-5 lg:px-8">
        <p className="surtitre text-encre/60 dark:text-white/60">{t('eyebrow')}</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:items-end">
          <h2
            id="gamme-titre"
            className="font-titre text-[36px] leading-[1.05] tracking-[-0.015em] sm:text-[52px]"
          >
            {t('title')}
          </h2>
          <p className="max-w-[38rem] text-[17px] leading-[1.6] text-encre/70 lg:justify-self-end dark:text-white/70">
            {t('intro')}
          </p>
        </div>

        <RangeCardStack cards={cards} />

        {/* Attabl Menu : le cinquieme element de la gamme, cote client */}
        <div className="mt-6 grid gap-6 rounded-[24px] bg-encre p-7 text-white sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center lg:p-14">
          <div>
            <p className="surtitre text-white/55">{t('menu.name')}</p>
            <h3 className="mt-4 font-titre text-[32px] leading-[1.08] sm:text-[42px]">
              {t('menu.title')}
            </h3>
            <p className="mt-4 max-w-[38rem] text-[17px] leading-[1.6] text-white/70">
              {t('menu.body')}
            </p>
          </div>
          <Link
            href="/features"
            className="inline-flex h-12 w-fit items-center rounded-full bg-white px-7 text-[16px] font-medium text-encre hover:bg-white/90"
          >
            {t('menu.cta')}
          </Link>
        </div>
      </div>
    </section>
  );
}
