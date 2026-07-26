'use client';

import { useTranslations } from 'next-intl';
import { Check, X } from 'lucide-react';

const ATTABL_POINTS = ['attablP1', 'attablP2', 'attablP3'] as const;
const RIVAL_POINTS = ['rivalP1', 'rivalP2', 'rivalP3'] as const;

export function CostOverThreeYears() {
  const t = useTranslations('marketing.pricing.cost3y');
  return (
    <section className="border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mx-auto max-w-[1080px] px-5 py-[96px] sm:px-7">
        <div className="mx-auto mb-11 max-w-[560px] text-center">
          <h2 className="text-[32px] font-semibold tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
            {t('title')}
          </h2>
          <p className="mt-3 text-base leading-[1.5] text-zinc-500 dark:text-zinc-400">
            {t('body')}
          </p>
        </div>
        <div className="mx-auto grid max-w-[760px] grid-cols-1 gap-[18px] sm:grid-cols-2">
          {/* Attabl */}
          <div className="rounded-2xl border border-zinc-900 bg-white p-[30px] shadow-[0_24px_48px_-30px_rgba(9,9,11,0.28)] dark:border-zinc-100 dark:bg-zinc-950">
            <div className="text-[13px] font-semibold text-orange-600 dark:text-orange-500">
              {t('attablLabel')}
            </div>
            <div className="mb-1 mt-3 text-[40px] font-semibold tracking-[-0.03em] text-zinc-950 dark:text-zinc-50">
              {t('attablPrice')}
            </div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">{t('attablSub')}</div>
            <div className="mt-5 flex flex-col gap-[9px]">
              {ATTABL_POINTS.map((p) => (
                <span
                  key={p}
                  className="flex items-center gap-2.5 text-[13.5px] text-zinc-700 dark:text-zinc-300"
                >
                  <Check
                    className="h-3.5 w-3.5 flex-none text-green-600 dark:text-green-500"
                    strokeWidth={2}
                  />
                  {t(p)}
                </span>
              ))}
            </div>
          </div>
          {/* Rival */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-[30px] dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">
              {t('rivalLabel')}
            </div>
            <div className="mb-1 mt-3 text-[40px] font-semibold tracking-[-0.03em] text-zinc-400 dark:text-zinc-500">
              {t('rivalPrice')}
            </div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">{t('rivalSub')}</div>
            <div className="mt-5 flex flex-col gap-[9px]">
              {RIVAL_POINTS.map((p) => (
                <span
                  key={p}
                  className="flex items-center gap-2.5 text-[13.5px] text-zinc-500 dark:text-zinc-400"
                >
                  <X
                    className="h-3.5 w-3.5 flex-none text-zinc-400 dark:text-zinc-500"
                    strokeWidth={2}
                  />
                  {t(p)}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="mx-auto mt-[22px] max-w-[560px] text-center text-[12.5px] leading-[1.5] text-zinc-400 dark:text-zinc-500">
          {t('disclaimer')}
        </p>
      </div>
    </section>
  );
}
