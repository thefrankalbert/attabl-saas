'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { BlurFade } from '@/components/ui/blur-fade';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TAB_KEYS = ['dashboard', 'orders', 'kitchen', 'stock'] as const;

const IMAGES = [
  '/marketing/sc-dashboard.png',
  '/marketing/sc-orders.png',
  '/marketing/sc-kds.png',
  '/marketing/app-inventaire-full.png',
] as const;

const CYCLE_MS = 5000;

export function ShowcaseTabs() {
  const t = useTranslations('marketing.home.showcase');
  const tabs = TAB_KEYS.map((k) => ({ title: t(`tabs.${k}.title`), desc: t(`tabs.${k}.desc`) }));
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const start = useCallback(() => {
    stop();
    if (reduce) return; // no auto-advance for motion-sensitive users (WCAG 2.2.2)
    timer.current = setInterval(() => setActive((a) => (a + 1) % TAB_KEYS.length), CYCLE_MS);
  }, [reduce, stop]);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  const select = (i: number) => {
    setActive(i);
    start();
  };

  return (
    <section className="border-y border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-7 sm:py-[120px]">
        <div className="max-w-[640px]">
          <BlurFade inView offset={20} blur="0px" duration={0.7}>
            <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-950 sm:text-[40px] dark:text-zinc-50">
              {t('title')}
            </h2>
            <p className="mt-4 text-[17px] leading-[1.55] text-zinc-600 sm:text-lg dark:text-zinc-400">
              {t('subtitle')}
            </p>
          </BlurFade>
        </div>
        {/* Pause auto-advance while the user is interacting with the showcase */}
        <div
          className="mt-11 grid grid-cols-1 items-start gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-10"
          onMouseEnter={stop}
          onMouseLeave={start}
        >
          {/* Tabs */}
          <div className="flex flex-col gap-1.5">
            {tabs.map((tab, i) => {
              const on = i === active;
              return (
                <Button
                  key={tab.title}
                  type="button"
                  variant="ghost"
                  onClick={() => select(i)}
                  aria-pressed={on}
                  className={cn(
                    'flex h-auto w-full flex-col items-start justify-start gap-0 whitespace-normal rounded-xl border px-[18px] py-4 text-left transition-colors',
                    on
                      ? 'border-zinc-200 bg-white shadow-[0_6px_18px_-12px_rgba(9,9,11,0.2)] hover:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-900'
                      : 'border-transparent bg-transparent hover:bg-white/60 dark:hover:bg-zinc-900/40',
                  )}
                >
                  <span className="block text-base font-semibold tracking-[-0.01em] text-zinc-950 dark:text-zinc-50">
                    {tab.title}
                  </span>
                  {on && (
                    <span className="mt-1.5 block text-sm leading-[1.55] text-zinc-500 dark:text-zinc-400">
                      {tab.desc}
                    </span>
                  )}
                  <span className="mt-3 block h-0.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                    {on &&
                      (reduce ? (
                        <span className="block h-full w-full bg-zinc-900 dark:bg-zinc-50" />
                      ) : (
                        <motion.span
                          key={active}
                          initial={{ width: '0%' }}
                          animate={{ width: '100%' }}
                          transition={{ duration: CYCLE_MS / 1000, ease: 'linear' }}
                          className="block h-full bg-zinc-900 dark:bg-zinc-50"
                        />
                      ))}
                  </span>
                </Button>
              );
            })}
          </div>
          {/* Panel */}
          <div className="relative min-h-[440px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_30px_60px_-32px_rgba(9,9,11,0.18)] dark:border-zinc-800 dark:bg-zinc-900">
            {IMAGES.map((src, i) => (
              <Image
                key={src}
                src={src}
                alt={tabs[i]?.title ?? ''}
                fill
                sizes="(max-width: 1024px) 100vw, 720px"
                className={cn(
                  'object-cover object-left-top transition-[opacity,transform] duration-500',
                  i === active ? 'translate-y-0 opacity-100' : 'translate-y-2.5 opacity-0',
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
