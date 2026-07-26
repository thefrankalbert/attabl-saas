import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BlurFade } from '@/components/ui/blur-fade';
import { cn } from '@/lib/utils';
import { BrowserFrame } from '../BrowserFrame';
import type { FeatureCategory as FeatureCategoryType } from './features.data';

export async function FeatureCategory({
  index,
  category,
}: {
  index: number;
  category: FeatureCategoryType;
}) {
  const t = await getTranslations(`marketing.features.categories.${category.id}`);
  const num = String(index + 1).padStart(2, '0');
  const alt = index % 2 === 1;

  return (
    <section
      id={`fcat-${category.id}`}
      className={cn(
        'scroll-mt-[70px] border-t border-zinc-100 dark:border-zinc-800/60',
        alt ? 'bg-zinc-50 dark:bg-zinc-900/40' : 'bg-white dark:bg-zinc-950',
      )}
    >
      <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-7 sm:py-[84px]">
        <BlurFade
          inView
          offset={20}
          blur="0px"
          duration={0.7}
          className="flex items-baseline gap-3.5"
        >
          <span className="text-[13px] font-semibold tabular-nums text-zinc-400 dark:text-zinc-500">
            {num}
          </span>
          <div>
            <h2 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
              {t('title')}
            </h2>
            <p className="mt-2 max-w-[560px] text-base leading-[1.5] text-zinc-500 dark:text-zinc-400">
              {t('desc')}
            </p>
            <Link
              href="/pricing"
              className="mt-3 inline-block rounded-full border border-zinc-200 bg-white px-3 py-[5px] text-[12.5px] font-semibold text-zinc-700 transition-colors hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {t('offer')}
            </Link>
          </div>
        </BlurFade>

        <div className="mt-7 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {category.items.map(({ k, Icon }, i) => (
              <BlurFade
                key={k}
                inView
                offset={16}
                blur="0px"
                duration={0.55}
                delay={(i % 3) * 0.06}
                className="border-b border-r border-zinc-100 px-6 py-[26px] dark:border-zinc-800/60"
              >
                <span className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-zinc-200 bg-gradient-to-b from-white to-zinc-100 text-zinc-900 dark:border-zinc-700 dark:from-zinc-800 dark:to-zinc-900 dark:text-zinc-100">
                  <Icon className="h-[19px] w-[19px]" strokeWidth={2} />
                </span>
                <div className="mt-[15px] text-[15px] font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
                  {t(`items.${k}.title`)}
                </div>
                <p className="mt-1.5 text-[13.5px] leading-[1.5] text-zinc-500 dark:text-zinc-400">
                  {t(`items.${k}.desc`)}
                </p>
              </BlurFade>
            ))}
          </div>
        </div>

        {category.media && (
          <BlurFade inView offset={20} blur="0px" duration={0.7} className="mt-4">
            <BrowserFrame label={t('mediaAlt')}>
              <Image
                src={category.media.src}
                alt={t('mediaAlt')}
                width={category.media.w}
                height={category.media.h}
                sizes="(max-width: 1120px) 100vw, 1064px"
                className="block max-h-[420px] w-full object-cover object-left-top"
              />
            </BrowserFrame>
          </BlurFade>
        )}
      </div>
    </section>
  );
}
