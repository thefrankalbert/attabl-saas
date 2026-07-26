import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { BlurFade } from '@/components/ui/blur-fade';
import { PLAN_AMOUNTS } from '@/lib/stripe/pricing';

export async function PricingTeaser() {
  const [t, locale] = await Promise.all([getTranslations('marketing.home.pricing'), getLocale()]);

  const monthly = PLAN_AMOUNTS.starter.monthly;
  const fmt = new Intl.NumberFormat(locale);
  const price = `${fmt.format(monthly)} FCFA`;
  const perDay = `${fmt.format(Math.round(monthly / 30))} FCFA`;

  return (
    <section className="bg-white px-5 pt-[100px] sm:px-7 dark:bg-zinc-950">
      <BlurFade
        inView
        offset={20}
        blur="0px"
        duration={0.7}
        className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-7 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 sm:px-9 dark:border-zinc-800 dark:bg-zinc-900/40"
      >
        <div className="max-w-[520px]">
          <h2 className="text-[26px] font-semibold tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
            {t('title')}
          </h2>
          <p className="mt-2.5 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            {t('body', { price, perDay })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-zinc-50 transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {t('ctaPrimary')}
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-[18px] py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            {t('ctaSecondary')}
          </Link>
        </div>
      </BlurFade>
    </section>
  );
}
