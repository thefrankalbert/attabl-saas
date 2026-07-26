'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const PROFILES = [
  {
    tag: 'p1tag',
    title: 'p1title',
    body: 'p1body',
    cta: 'p1cta',
    dot: 'bg-zinc-500',
    highlight: false,
  },
  {
    tag: 'p2tag',
    title: 'p2title',
    body: 'p2body',
    cta: 'p2cta',
    dot: 'bg-orange-600',
    highlight: true,
  },
  {
    tag: 'p3tag',
    title: 'p3title',
    body: 'p3body',
    cta: 'p3cta',
    dot: 'bg-zinc-900 dark:bg-zinc-100',
    highlight: false,
  },
] as const;

export function WhichPlan() {
  const t = useTranslations('marketing.pricing.whichPlan');
  return (
    <section className="border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mx-auto max-w-[1080px] px-5 py-[88px] sm:px-7">
        <div className="mx-auto mb-11 max-w-[560px] text-center">
          <h2 className="text-[32px] font-semibold tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
            {t('title')}
          </h2>
          <p className="mt-3 text-base leading-[1.5] text-zinc-500 dark:text-zinc-400">
            {t('subtitle')}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-3">
          {PROFILES.map((p) => (
            <div
              key={p.tag}
              className={cn(
                'rounded-2xl border bg-white p-[26px] dark:bg-zinc-950',
                p.highlight
                  ? 'border-zinc-900 shadow-[0_24px_48px_-30px_rgba(9,9,11,0.28)] dark:border-zinc-100'
                  : 'border-zinc-200 dark:border-zinc-800',
              )}
            >
              <div
                className={cn(
                  'text-xs font-semibold uppercase tracking-[0.04em]',
                  p.highlight
                    ? 'text-orange-600 dark:text-orange-500'
                    : 'text-zinc-500 dark:text-zinc-400',
                )}
              >
                {t(p.tag)}
              </div>
              <div className="mt-2 text-xl font-semibold tracking-[-0.02em] text-zinc-950 dark:text-zinc-50">
                {t(p.title)}
              </div>
              <p className="mb-4 mt-2 text-sm leading-[1.55] text-zinc-600 dark:text-zinc-400">
                {t(p.body)}
              </p>
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                <span className={cn('h-[9px] w-[9px] rounded-full', p.dot)} />
                {t(p.cta)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-7 text-center text-sm text-zinc-600 dark:text-zinc-400">
          {t('help')}{' '}
          <Link href="/contact" className="font-semibold text-zinc-950 dark:text-zinc-50">
            {t('helpLink')} &rarr;
          </Link>
        </p>
      </div>
    </section>
  );
}
