import { getTranslations } from 'next-intl/server';
import { BlurFade } from '@/components/ui/blur-fade';

const STEPS = ['s1', 's2', 's3'] as const;

export async function SolutionsSteps() {
  const t = await getTranslations('marketing.solutions.steps');
  return (
    <section className="border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mx-auto max-w-[1120px] px-5 py-16 text-center sm:px-7 sm:py-[88px]">
        <BlurFade inView offset={20} blur="0px" duration={0.7}>
          <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
            {t('title')}
          </h2>
          <p className="mx-auto mt-3 max-w-[480px] text-base leading-[1.5] text-zinc-500 dark:text-zinc-400">
            {t('subtitle')}
          </p>
        </BlurFade>
        <div className="mt-10 grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <BlurFade
              key={s}
              inView
              offset={20}
              blur="0px"
              duration={0.7}
              delay={i * 0.08}
              className="rounded-[14px] border border-zinc-200 bg-white px-6 py-[26px] dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="text-[13px] font-semibold text-zinc-400 dark:text-zinc-500">
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="mt-2.5 text-[17px] font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
                {t(`${s}.title`)}
              </div>
              <p className="mt-2 text-sm leading-[1.5] text-zinc-500 dark:text-zinc-400">
                {t(`${s}.body`)}
              </p>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
