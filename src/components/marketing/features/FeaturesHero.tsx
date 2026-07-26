import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BlurFade } from '@/components/ui/blur-fade';
import { FEATURE_CATEGORIES } from './features.data';

export async function FeaturesHero() {
  const t = await getTranslations('marketing.features');
  return (
    <section className="bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[1120px] px-5 pt-20 text-center sm:px-7 sm:pt-[88px]">
        <BlurFade offset={18} blur="0px" duration={0.7}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            {t('eyebrow')}
          </p>
          <h1 className="mx-auto mt-3.5 max-w-[720px] text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] text-zinc-950 lg:text-[52px] dark:text-zinc-50">
            {t('heroTitle')}
          </h1>
          <p className="mx-auto mt-4 max-w-[560px] text-[19px] leading-[1.5] text-zinc-600 dark:text-zinc-400">
            {t('heroSubtitle')}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {FEATURE_CATEGORIES.map((c) => (
              <Link
                key={c.id}
                href={`#fcat-${c.id}`}
                className="rounded-full border border-zinc-200 bg-zinc-100 px-[15px] py-2 text-[13px] font-semibold text-zinc-900 transition-colors hover:border-zinc-300 hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {t(`categories.${c.id}.title`)}
              </Link>
            ))}
          </div>
        </BlurFade>
        <BlurFade
          inView
          offset={20}
          blur="0px"
          duration={0.7}
          className="mx-auto mt-12 max-w-[1000px] overflow-hidden rounded-2xl border border-zinc-200 shadow-[0_40px_80px_-34px_rgba(9,9,11,0.28)] dark:border-zinc-800"
        >
          <Image
            src="/marketing/sc-dashboard.png"
            alt={t('heroImageAlt')}
            width={2401}
            height={1617}
            priority
            sizes="(max-width: 1120px) 100vw, 1000px"
            className="block h-auto w-full"
          />
        </BlurFade>
      </div>
    </section>
  );
}
