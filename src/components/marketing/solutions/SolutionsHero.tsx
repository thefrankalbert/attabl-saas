import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BlurFade } from '@/components/ui/blur-fade';

const CHIPS = ['restaurant', 'hotel', 'qsr', 'bar'] as const;

export async function SolutionsHero() {
  const t = await getTranslations('marketing.solutions');
  return (
    <section className="bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[1120px] px-5 pb-14 pt-20 text-center sm:px-7 sm:pt-[88px]">
        <BlurFade offset={18} blur="0px" duration={0.7}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            {t('eyebrow')}
          </p>
          <h1 className="mx-auto mt-3.5 max-w-[760px] text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] text-zinc-950 lg:text-[52px] dark:text-zinc-50">
            {t('title')}
          </h1>
          <p className="mx-auto mt-4 max-w-[580px] text-[19px] leading-[1.5] text-zinc-600 dark:text-zinc-400">
            {t('subtitle')}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {CHIPS.map((k) => (
              <Link
                key={k}
                href={`#ind-${k}`}
                className="rounded-full border border-zinc-200 bg-zinc-100 px-4 py-[9px] text-[13px] font-semibold text-zinc-900 transition-colors hover:border-zinc-300 hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {t(`industries.${k}.tag`)}
              </Link>
            ))}
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
