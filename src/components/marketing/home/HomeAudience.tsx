import { getTranslations } from 'next-intl/server';
import { AnimatedWords } from './AnimatedWords';
import { AudiencePanels, type AudiencePanel } from './AudiencePanels';

const ITEMS = [
  { key: 'restaurants', photo: 'service' },
  { key: 'hotels', photo: 'bar' },
  { key: 'bars', photo: 'salle' },
] as const;

export async function HomeAudience() {
  const t = await getTranslations('marketing.home.audience');
  const panels: AudiencePanel[] = ITEMS.map(({ key, photo }) => ({
    key,
    title: t(`items.${key}.title`),
    body: t(`items.${key}.body`),
    image: `/marketing/home/pour-qui/${photo}.webp`,
    imageAlt: t(`items.${key}.imageAlt`),
  }));

  return (
    <section
      className="mx-auto max-w-[1440px] px-5 py-20 text-encre lg:px-8 lg:py-28 dark:text-white"
      aria-labelledby="qui-titre"
    >
      <p className="surtitre text-encre/60 dark:text-white/60">{t('eyebrow')}</p>
      <h2
        data-mots
        id="qui-titre"
        className="mt-4 max-w-[20ch] font-titre text-[36px] leading-[1.05] tracking-[-0.015em] sm:text-[52px]"
      >
        <AnimatedWords text={t('title')} masked />
      </h2>
      <AudiencePanels panels={panels} />
    </section>
  );
}
