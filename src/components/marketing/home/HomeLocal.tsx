import { getTranslations } from 'next-intl/server';
import { AnimatedWords } from './AnimatedWords';

const ITEM_KEYS = ['offline', 'fcfa', 'whatsapp', 'ready'] as const;

export async function HomeLocal() {
  const t = await getTranslations('marketing.home.local');

  return (
    <section className="bg-nuit text-white" aria-labelledby="ici-titre">
      <div className="mx-auto grid max-w-[1440px] gap-14 px-5 py-20 lg:grid-cols-2 lg:gap-20 lg:px-8 lg:py-28">
        <div>
          <p className="surtitre text-white/55">{t('eyebrow')}</p>
          <h2
            data-mots
            id="ici-titre"
            className="mt-4 font-titre text-[36px] leading-[1.05] tracking-[-0.015em] sm:text-[52px]"
          >
            <AnimatedWords text={t('title')} masked />
          </h2>
        </div>
        <dl className="divide-y divide-white/15 border-y border-white/15">
          {ITEM_KEYS.map((k) => (
            <div key={k} data-monte className="grid gap-2 py-6 sm:grid-cols-[180px_1fr]">
              <dt className="font-medium">{t(`items.${k}.title`)}</dt>
              <dd className="text-white/70">{t(`items.${k}.body`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
