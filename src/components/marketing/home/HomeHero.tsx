import Image from 'next/image';
import Link from 'next/link';
import { Lock, Play } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { BlurFade } from '@/components/ui/blur-fade';
import { HeroTilt } from '../HeroTilt';

export async function HomeHero() {
  const t = await getTranslations('marketing.home.hero');

  return (
    <section className="relative overflow-hidden bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[1080px] px-5 pt-16 text-center sm:px-7 sm:pt-[76px]">
        <BlurFade offset={18} blur="0px" duration={0.7} className="mx-auto max-w-[720px]">
          <h1 className="whitespace-pre-line text-[44px] font-semibold leading-[1] tracking-[-0.037em] text-zinc-950 lg:text-[60px] dark:text-zinc-50">
            {t('title')}
          </h1>
        </BlurFade>
        <BlurFade offset={18} blur="0px" duration={0.7} delay={0.12}>
          <p className="mx-auto mt-5 max-w-[500px] text-[19px] leading-[1.5] tracking-[-0.011em] text-zinc-600 dark:text-zinc-400">
            {t('subtitle')}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center rounded-lg bg-zinc-900 px-[22px] py-3 text-[15px] font-medium text-zinc-50 transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {t('ctaPrimary')}
            </Link>
            <a
              href="mailto:contact@attabl.com"
              className="inline-flex items-center gap-[7px] rounded-lg border border-zinc-200 bg-white px-5 py-3 text-[15px] font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              <Play className="h-4 w-4" fill="currentColor" strokeWidth={0} />
              {t('ctaDemo')}
            </a>
          </div>
          <p className="mt-5 text-[13px] text-zinc-500 dark:text-zinc-400">{t('trust')}</p>
        </BlurFade>

        <div className="mx-auto mt-14 max-w-[1000px]">
          <HeroTilt className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_50px_100px_-34px_rgba(9,9,11,0.34),0_12px_30px_-14px_rgba(9,9,11,0.12)] dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex h-[42px] items-center gap-3.5 border-b border-zinc-100 bg-zinc-50 px-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex gap-[7px]">
                <span className="h-[11px] w-[11px] rounded-full bg-zinc-200 dark:bg-zinc-700" />
                <span className="h-[11px] w-[11px] rounded-full bg-zinc-200 dark:bg-zinc-700" />
                <span className="h-[11px] w-[11px] rounded-full bg-zinc-200 dark:bg-zinc-700" />
              </div>
              <div className="mx-auto flex h-6 max-w-[300px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                <Lock className="h-[11px] w-[11px]" />
                attabl.com
              </div>
              <div className="w-[60px]" />
            </div>
            <Image
              src="/marketing/app-dashboard-full.png"
              alt={t('imageAlt')}
              width={2341}
              height={1350}
              priority
              sizes="(max-width: 1080px) 100vw, 1000px"
              className="block h-auto w-full"
            />
          </HeroTilt>
        </div>
      </div>
    </section>
  );
}
