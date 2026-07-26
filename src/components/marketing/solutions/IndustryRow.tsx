import Image from 'next/image';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { BlurFade } from '@/components/ui/blur-fade';
import { cn } from '@/lib/utils';
import { BrowserFrame } from '../BrowserFrame';

const POINTS = ['p1', 'p2', 'p3', 'p4'] as const;

export type IndustryKey = 'restaurant' | 'hotel' | 'qsr' | 'bar';

export async function IndustryRow({
  index,
  keyName,
  offer,
  media,
  reverse,
}: {
  index: number;
  keyName: IndustryKey;
  offer: string;
  media: { src: string; w: number; h: number };
  reverse: boolean;
}) {
  const t = await getTranslations('marketing.solutions');
  const ti = await getTranslations(`marketing.solutions.industries.${keyName}`);
  const num = String(index + 1).padStart(2, '0');

  return (
    <section
      id={`ind-${keyName}`}
      className={cn(
        'scroll-mt-[70px] border-t border-zinc-100 dark:border-zinc-800/60',
        reverse ? 'bg-zinc-50 dark:bg-zinc-900/40' : 'bg-white dark:bg-zinc-950',
      )}
    >
      <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-7 sm:py-[88px]">
        <BlurFade
          inView
          offset={22}
          blur="0px"
          duration={0.7}
          className="grid grid-cols-1 items-center gap-9 lg:grid-cols-[1fr_1.05fr] lg:gap-14"
        >
          {/* Media (first in DOM so it sits on top on mobile) */}
          <BrowserFrame
            label={ti('mediaLabel')}
            className={cn(reverse ? 'lg:order-1' : 'lg:order-2')}
          >
            <Image
              src={media.src}
              alt={`${ti('mediaLabel')} Attabl`}
              width={media.w}
              height={media.h}
              sizes="(max-width: 1024px) 100vw, 560px"
              className="block h-auto w-full"
            />
          </BrowserFrame>

          {/* Text */}
          <div className={cn(reverse ? 'lg:order-2' : 'lg:order-1')}>
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">
              {num} - {ti('tag')}
            </span>
            <h2 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-zinc-950 dark:text-zinc-50">
              {ti('title')}
            </h2>
            <p className="mt-3.5 max-w-[440px] text-[17px] leading-[1.5] text-zinc-600 dark:text-zinc-400">
              {ti('lead')}
            </p>
            <ul className="mt-6 flex flex-col gap-3">
              {POINTS.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-2.5 text-[15px] text-zinc-800 dark:text-zinc-200"
                >
                  <span className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
                    <Check
                      className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-100"
                      strokeWidth={2}
                    />
                  </span>
                  {ti(`points.${p}`)}
                </li>
              ))}
            </ul>
            <div className="mt-6 max-w-[460px] rounded-xl border border-zinc-200 bg-zinc-50 px-[18px] py-4 dark:border-zinc-800 dark:bg-zinc-900/40">
              <span className="inline-block rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                {t('recommended')} : {offer}
              </span>
              <p className="mt-2.5 text-[13.5px] leading-[1.5] text-zinc-600 dark:text-zinc-400">
                {ti('offerWhy')}
              </p>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <Link
                href="/pricing"
                className="inline-flex items-center rounded-lg bg-zinc-900 px-[18px] py-2.5 text-sm font-semibold text-zinc-50 transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {t('viewOffer', { offer })}
              </Link>
              <Link
                href="/features"
                className="text-sm font-semibold text-zinc-900 transition-colors hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
              >
                {t('exploreFeatures')} &rarr;
              </Link>
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
