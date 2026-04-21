'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { UtensilsCrossed, Hotel, Zap, Wine, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import DashboardPreview from './DashboardPreview';

type Segment = 'restaurant' | 'hotel' | 'quickservice' | 'bar' | 'fastfood';

const segmentDefs: { key: Segment; icon: React.ElementType }[] = [
  { key: 'restaurant', icon: UtensilsCrossed },
  { key: 'hotel', icon: Hotel },
  { key: 'quickservice', icon: Zap },
  { key: 'bar', icon: Wine },
  { key: 'fastfood', icon: Flame },
];

export default function VideoHero() {
  const t = useTranslations('marketing.home.videoHero');
  const [activeSegment, setActiveSegment] = useState<Segment>('restaurant');

  return (
    <section className="bg-white dark:bg-neutral-950 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Centered text */}
        <div className="text-center">
          <h1 className="mx-auto max-w-4xl font-[family-name:var(--font-sora)] text-5xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-6xl lg:text-7xl">
            <span className="block">{t('titleLine1')}</span>
            <span className="block">{t('titleLine2')}</span>
            <span className="block">{t('titleLine3')}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-neutral-500 dark:text-neutral-400">
            {t('subtitle')}
          </p>

          {/* CTA row */}
          <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-lg bg-neutral-900 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {t('ctaPrimary')}
            </Link>
            <Link
              href="/contact"
              className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-8 py-4 text-base font-semibold text-neutral-900 dark:text-white transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              {t('ctaSecondary')}
            </Link>
          </div>

          {/* Segment pills */}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {segmentDefs.map(({ key, icon: Icon }) => (
              <Button
                key={key}
                variant="ghost"
                onClick={() => setActiveSegment(key)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium h-auto ${
                  activeSegment === key
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(`segments.${key}`)}
              </Button>
            ))}
          </div>
        </div>

        {/* Dashboard mockup */}
        <div className="mx-auto mt-16 max-w-5xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSegment}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <DashboardPreview segment={activeSegment} className="w-full" />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
