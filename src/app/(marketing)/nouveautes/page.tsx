'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Rss } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BlurFade } from '@/components/ui/blur-fade';
import { BrowserFrame } from '@/components/marketing/BrowserFrame';
import { cn } from '@/lib/utils';

type ReleaseType = 'new' | 'improvement' | 'fix';

const RELEASES: {
  id: string;
  v: string;
  date: string;
  type: ReleaseType;
  media?: { src: string; w: number; h: number };
}[] = [
  { id: 'r1', v: 'v2.8', date: '2026-07-14', type: 'new' },
  { id: 'r2', v: 'v2.7', date: '2026-06-30', type: 'improvement' },
  {
    id: 'r3',
    v: 'v2.6',
    date: '2026-06-16',
    type: 'new',
    media: { src: '/marketing/sc-dashboard.png', w: 2401, h: 1617 },
  },
  { id: 'r4', v: 'v2.5', date: '2026-06-02', type: 'improvement' },
  {
    id: 'r5',
    v: 'v2.4',
    date: '2026-05-19',
    type: 'fix',
    media: { src: '/marketing/sc-kds.png', w: 2360, h: 1640 },
  },
  { id: 'r6', v: 'v2.3', date: '2026-05-05', type: 'new' },
  { id: 'r7', v: 'v2.2', date: '2026-04-21', type: 'new' },
  { id: 'r8', v: 'v2.1', date: '2026-04-07', type: 'improvement' },
  { id: 'r9', v: 'v2.0', date: '2026-03-24', type: 'new' },
];

const TYPE_META: Record<ReleaseType, { badge: string; check: string }> = {
  new: {
    badge:
      'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400',
    check: 'text-green-600 dark:text-green-500',
  },
  improvement: {
    badge:
      'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400',
    check: 'text-blue-600 dark:text-blue-500',
  },
  fix: {
    badge:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400',
    check: 'text-amber-600 dark:text-amber-500',
  },
};

const FILTERS = ['all', 'new', 'improvement', 'fix'] as const;
const ITEMS = ['i1', 'i2', 'i3'] as const;

export default function NouveautesPage() {
  const t = useTranslations('marketing.nouveautes');
  const locale = useLocale();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');

  // timeZone: 'UTC' keeps server/client rendering identical (no hydration drift, no off-by-one).
  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    [locale],
  );
  const visible = filter === 'all' ? RELEASES : RELEASES.filter((r) => r.type === filter);

  return (
    <>
      {/* Header */}
      <section className="bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-[900px] px-5 pb-6 pt-20 sm:px-7 sm:pt-[80px]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            {t('eyebrow')}
          </p>
          <h1 className="mt-3 text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] text-zinc-950 lg:text-[52px] dark:text-zinc-50">
            {t('title')}
          </h1>
          <p className="mt-4 max-w-[540px] text-[19px] leading-[1.5] text-zinc-600 dark:text-zinc-400">
            {t('subtitle')}
          </p>
          <Link
            href="/signup"
            className="mt-[22px] inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-100 px-[15px] py-[9px] text-sm font-semibold text-zinc-900 transition-colors hover:border-zinc-300 hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            <Rss className="h-[15px] w-[15px]" strokeWidth={2} />
            {t('subscribe')}
          </Link>
          <div className="mt-7 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Button
                key={f}
                type="button"
                variant="ghost"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn(
                  'h-auto rounded-full border px-[15px] py-2 text-[13px] font-medium transition-colors',
                  filter === f
                    ? 'border-zinc-900 bg-zinc-900 text-zinc-50 hover:bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900',
                )}
              >
                {t(`filters.${f}`)}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-[900px] px-5 pb-16 sm:px-7">
          {visible.map((r) => {
            const meta = TYPE_META[r.type];
            return (
              <BlurFade
                key={r.id}
                inView
                offset={20}
                blur="0px"
                duration={0.6}
                className="grid grid-cols-1 gap-4 border-t border-zinc-200 py-9 sm:grid-cols-[150px_1fr] sm:gap-8 dark:border-zinc-800"
              >
                <div className="self-start sm:sticky sm:top-[80px]">
                  <div className="text-xl font-semibold tracking-[-0.02em] text-zinc-950 dark:text-zinc-50">
                    {r.v}
                  </div>
                  <div className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                    {dateFmt.format(new Date(r.date))}
                  </div>
                </div>
                <div>
                  <span
                    className={cn(
                      'inline-block rounded-full border px-2.5 py-1 text-xs font-semibold',
                      meta.badge,
                    )}
                  >
                    {t(`filters.${r.type}`)}
                  </span>
                  <h2 className="mt-3.5 text-2xl font-semibold tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
                    {t(`releases.${r.id}.title`)}
                  </h2>
                  <p className="mt-2.5 text-base leading-[1.55] text-zinc-600 dark:text-zinc-400">
                    {t(`releases.${r.id}.body`)}
                  </p>
                  <ul className="mt-[18px] flex flex-col gap-2.5">
                    {ITEMS.map((it) => (
                      <li
                        key={it}
                        className="flex items-center gap-2.5 text-sm text-zinc-700 dark:text-zinc-300"
                      >
                        <Check
                          className={cn('h-[15px] w-[15px] flex-none', meta.check)}
                          strokeWidth={2}
                        />
                        {t(`releases.${r.id}.${it}`)}
                      </li>
                    ))}
                  </ul>
                  {r.media && (
                    <BrowserFrame className="mt-5 max-w-[520px]">
                      <Image
                        src={r.media.src}
                        alt={t(`releases.${r.id}.mediaAlt`)}
                        width={r.media.w}
                        height={r.media.h}
                        sizes="(max-width: 900px) 100vw, 520px"
                        className="block h-auto w-full"
                      />
                    </BrowserFrame>
                  )}
                </div>
              </BlurFade>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white px-5 pb-[110px] pt-5 sm:px-7 dark:bg-zinc-950">
        <div className="mx-auto max-w-[900px] rounded-3xl bg-zinc-950 px-6 py-16 text-center sm:px-10 dark:bg-zinc-900">
          <h2 className="mx-auto max-w-[500px] text-[32px] font-semibold leading-[1.12] tracking-[-0.025em] text-white">
            {t('cta.title')}
          </h2>
          <p className="mx-auto mt-3.5 max-w-[440px] text-base leading-[1.5] text-zinc-400">
            {t('cta.subtitle')}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center rounded-[10px] bg-white px-[26px] py-3.5 text-[15px] font-semibold text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              {t('cta.primary')}
            </Link>
            <Link
              href="/features"
              className="inline-flex items-center rounded-[10px] border border-white/15 bg-white/[0.08] px-[22px] py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-white/[0.14]"
            >
              {t('cta.secondary')}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
