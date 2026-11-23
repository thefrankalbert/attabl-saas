import { getTranslations } from 'next-intl/server';
import { AnimatedWords } from './AnimatedWords';

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4'] as const;

export async function HomeFaq() {
  const t = await getTranslations('marketing.home.faq');

  return (
    <section
      className="mx-auto max-w-[1440px] px-5 py-20 text-encre lg:px-8 lg:py-28 dark:text-white"
      aria-labelledby="faq-titre"
    >
      <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
        <h2
          data-mots
          id="faq-titre"
          className="font-titre text-[36px] leading-[1.05] tracking-[-0.015em] sm:text-[52px]"
        >
          <AnimatedWords text={t('title')} masked />
        </h2>
        <div className="divide-y divide-trait border-y border-trait">
          {FAQ_KEYS.map((k, i) => (
            <details key={k} data-monte open={i === 0} className="group py-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-[18px] font-medium [&::-webkit-details-marker]:hidden">
                {t(`items.${k}.q`)}
                <span
                  className="text-[24px] leading-none transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="pb-5 text-[16px] leading-[1.6] text-encre/70 dark:text-white/70">
                {t(`items.${k}.a`)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
