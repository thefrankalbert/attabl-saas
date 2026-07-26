import { Coffee, Hotel, Utensils } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { BlurFade } from '@/components/ui/blur-fade';

const CARDS = [
  { key: 'restaurant', Icon: Utensils },
  { key: 'hotel', Icon: Hotel },
  { key: 'bar', Icon: Coffee },
] as const;

export async function SolutionsUseCases() {
  const t = await getTranslations('marketing.solutions.useCases');
  return (
    <section className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-7 sm:py-[88px]">
        <BlurFade
          inView
          offset={20}
          blur="0px"
          duration={0.7}
          className="mx-auto mb-11 max-w-[560px] text-center"
        >
          <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
            {t('title')}
          </h2>
          <p className="mt-3 text-base leading-[1.5] text-zinc-500 dark:text-zinc-400">
            {t('subtitle')}
          </p>
        </BlurFade>
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map(({ key, Icon }) => (
            <BlurFade
              key={key}
              inView
              offset={20}
              blur="0px"
              duration={0.7}
              className="rounded-2xl border border-zinc-200 bg-zinc-50 p-[26px] dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
                  <Icon
                    className="h-[18px] w-[18px] text-zinc-900 dark:text-zinc-100"
                    strokeWidth={2}
                  />
                </span>
                <span className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">
                  {t(`cards.${key}.tag`)}
                </span>
              </div>
              <div className="mt-3.5 text-[17px] font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
                {t(`cards.${key}.title`)}
              </div>
              <p className="mt-2 text-sm leading-[1.55] text-zinc-600 dark:text-zinc-400">
                {t(`cards.${key}.body`)}
              </p>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
