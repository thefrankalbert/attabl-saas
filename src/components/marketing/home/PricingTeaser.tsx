import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { PLAN_AMOUNTS, approxPricePerDay } from '@/lib/billing/pricing';
import { cn } from '@/lib/utils';
import { AnimatedWords } from './AnimatedWords';

const PLAN_KEYS = ['starter', 'pro', 'business'] as const;

const CTA_OUTLINE =
  'mt-8 inline-flex h-11 items-center rounded-full border border-white/60 px-6 text-[15px] font-medium hover:bg-white/10';
const CTA_SOLID =
  'mt-8 inline-flex h-11 items-center rounded-full bg-white px-6 text-[15px] font-medium text-encre hover:bg-white/90';

export async function PricingTeaser() {
  const [t, locale] = await Promise.all([getTranslations('marketing.home.pricing'), getLocale()]);
  const fmt = new Intl.NumberFormat(locale);

  return (
    <section className="bg-nuit text-white" aria-labelledby="prix-titre">
      <div className="mx-auto max-w-[1440px] px-5 py-20 lg:px-8 lg:py-28">
        <p className="surtitre text-white/55">{t('eyebrow')}</p>
        <h2
          data-mots
          id="prix-titre"
          className="mt-4 font-titre text-[36px] leading-[1.05] tracking-[-0.015em] sm:text-[52px]"
        >
          <AnimatedWords text={t('title')} masked />
        </h2>
        <p className="mt-4 text-[17px] text-white/70">{t('trial')}</p>
        <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-0">
          {PLAN_KEYS.map((k) => {
            const monthly = PLAN_AMOUNTS[k].monthly;
            const detail =
              k === 'business'
                ? t('plans.business.note')
                : t('perDay', { perDay: `${fmt.format(approxPricePerDay(monthly))} FCFA` });
            return (
              <div key={k} data-monte className="border-white/20 md:border-l md:px-8">
                {k === 'pro' ? (
                  <div className="flex items-center gap-3">
                    <h3 className="text-[20px] font-medium">{t('plans.pro.name')}</h3>
                    <span className="surtitre rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/80">
                      {t('plans.pro.badge')}
                    </span>
                  </div>
                ) : (
                  <h3 className="text-[20px] font-medium">{t(`plans.${k}.name`)}</h3>
                )}
                <p className="mt-2 text-[15px] text-white/60">{t(`plans.${k}.desc`)}</p>
                <p className="mt-8 font-titre text-[48px] leading-none">
                  {fmt.format(monthly)}
                  <span className="ml-2 font-sans text-[16px] text-white/60">{t('perMonth')}</span>
                </p>
                <p className="mt-2 text-[14px] text-white/50">{detail}</p>
                <Link href="/signup" className={cn(k === 'pro' ? CTA_SOLID : CTA_OUTLINE)}>
                  {t('cta')}
                </Link>
              </div>
            );
          })}
        </div>
        <div
          data-monte
          className="mt-12 flex flex-col gap-4 border-t border-white/20 pt-8 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-[16px] text-white/80">
            <span className="font-medium text-white">{t('enterprise.title')}</span>{' '}
            {t('enterprise.body')}
          </p>
          <Link
            href="/pricing"
            className="inline-flex w-fit items-center text-[16px] font-medium underline decoration-1 underline-offset-[6px] hover:decoration-2"
          >
            {t('compare')}
          </Link>
        </div>
      </div>
    </section>
  );
}
