'use client';

import { useTranslations } from 'next-intl';

const CARDS = [
  { t: 'c1t', b: 'c1b' },
  { t: 'c2t', b: 'c2b' },
  { t: 'c3t', b: 'c3b' },
  { t: 'c4t', b: 'c4b' },
] as const;

export function IncludedEverywhere() {
  const t = useTranslations('marketing.pricing.included');
  return (
    <section className="bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[1080px] px-5 pt-[88px] sm:px-7">
        <h2 className="mb-9 text-center text-[26px] font-semibold tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
          {t('title')}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CARDS.map((c) => (
            <div
              key={c.t}
              className="rounded-[14px] border border-zinc-200 bg-zinc-50 p-[22px] dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <div className="text-[15px] font-semibold tracking-[-0.015em] text-zinc-950 dark:text-zinc-50">
                {t(c.t)}
              </div>
              <p className="mt-1.5 text-[13.5px] leading-[1.5] text-zinc-500 dark:text-zinc-400">
                {t(c.b)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
