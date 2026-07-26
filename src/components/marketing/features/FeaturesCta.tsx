import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BlurFade } from '@/components/ui/blur-fade';

export async function FeaturesCta() {
  const t = await getTranslations('marketing.features.cta');
  return (
    <section className="bg-white px-5 pb-[110px] pt-10 sm:px-7 dark:bg-zinc-950">
      <BlurFade
        inView
        offset={20}
        blur="0px"
        duration={0.7}
        className="mx-auto max-w-[1120px] rounded-3xl bg-zinc-950 px-6 py-[72px] text-center sm:px-10 dark:bg-zinc-900"
      >
        <h2 className="mx-auto max-w-[560px] text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-white sm:text-4xl">
          {t('title')}
        </h2>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center rounded-[10px] bg-white px-[26px] py-3.5 text-[15px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            {t('primary')}
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-[10px] border border-white/15 bg-white/[0.08] px-[22px] py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-white/[0.14]"
          >
            {t('secondary')}
          </Link>
        </div>
      </BlurFade>
    </section>
  );
}
