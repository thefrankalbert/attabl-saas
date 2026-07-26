import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BlurFade } from '@/components/ui/blur-fade';

export async function StockFeature() {
  const t = await getTranslations('marketing.home.stock');

  return (
    <section className="bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-7 sm:py-[120px]">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.95fr_1.15fr] lg:gap-16">
          <BlurFade inView offset={20} blur="0px" duration={0.7} className="order-2 lg:order-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-[11px] py-1 text-[13px] font-semibold text-orange-600 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-400">
              {t('badge')}
            </span>
            <h2 className="mt-5 text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-950 sm:text-[40px] dark:text-zinc-50">
              {t('title')}
            </h2>
            <p className="mt-4 text-[17px] leading-[1.55] tracking-[-0.011em] text-zinc-600 sm:text-lg dark:text-zinc-400">
              {t('body')}
            </p>
            <Link
              href="/features#fcat-stock"
              className="mt-6 inline-block text-[15px] font-medium text-zinc-900 transition-colors hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
            >
              {t('link')} &rarr;
            </Link>
          </BlurFade>
          <BlurFade
            inView
            offset={20}
            blur="0px"
            duration={0.7}
            className="order-1 overflow-hidden rounded-2xl border border-zinc-200 shadow-[0_30px_60px_-32px_rgba(9,9,11,0.2)] lg:order-2 dark:border-zinc-800"
          >
            <div className="flex h-[38px] items-center gap-3 border-b border-zinc-100 bg-zinc-50 px-3.5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
              </div>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {t('browserLabel')}
              </span>
            </div>
            <Image
              src="/marketing/app-inventaire-full.png"
              alt={t('imageAlt')}
              width={2344}
              height={1348}
              sizes="(max-width: 1024px) 100vw, 640px"
              className="block h-auto w-full"
            />
          </BlurFade>
        </div>
      </div>
    </section>
  );
}
