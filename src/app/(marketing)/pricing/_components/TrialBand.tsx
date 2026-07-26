'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';

const FEATS = ['f1', 'f2', 'f3', 'f4'] as const;
const TRUST = ['t1', 't2', 't3'] as const;

export function TrialBand() {
  const t = useTranslations('marketing.pricing.essai');
  return (
    <section className="bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[1160px] px-5 pt-[72px] sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-7 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-9 sm:px-9 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="max-w-[460px]">
            <h2 className="text-[26px] font-semibold tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
              {t('title')}
            </h2>
            <p className="mt-2.5 text-[15px] leading-[1.55] text-zinc-600 dark:text-zinc-400">
              {t('body')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
            {FEATS.map((f) => (
              <div
                key={f}
                className="flex items-center gap-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                <Check
                  className="h-4 w-4 flex-none text-green-600 dark:text-green-500"
                  strokeWidth={2}
                />
                {t(f)}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-[18px] flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {TRUST.map((tk, i) => (
            <div key={tk} className="flex items-center gap-8">
              {i > 0 && <span className="h-1 w-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />}
              <span className="text-[13px] text-zinc-600 dark:text-zinc-400">{t(tk)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
