'use client';

import { motion } from 'framer-motion';
import { Sparkles, Shield, Zap, Globe, BarChart3, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

type UpdateTag = 'tagNew' | 'tagImprovement';
type DateKey = 'dateFeb2026' | 'dateJan2026' | 'dateDec2025';
type UpdateId =
  | 'rbac'
  | 'i18n'
  | 'autolock'
  | 'stockAlert'
  | 'suppliers'
  | 'stockHistory'
  | 'landing'
  | 'qr';

// Content is structural (dates, tags, icons); labels/descriptions live in
// next-intl under `marketing.nouveautes.*` so the timeline stays a single
// source of truth without coupling copy to the component.
const UPDATES: ReadonlyArray<{
  id: UpdateId;
  dateKey: DateKey;
  tagKey: UpdateTag;
  icon: typeof Shield;
}> = [
  { id: 'rbac', dateKey: 'dateFeb2026', tagKey: 'tagNew', icon: Shield },
  { id: 'i18n', dateKey: 'dateFeb2026', tagKey: 'tagNew', icon: Globe },
  { id: 'autolock', dateKey: 'dateFeb2026', tagKey: 'tagImprovement', icon: Shield },
  { id: 'stockAlert', dateKey: 'dateJan2026', tagKey: 'tagNew', icon: Zap },
  { id: 'suppliers', dateKey: 'dateJan2026', tagKey: 'tagNew', icon: BarChart3 },
  { id: 'stockHistory', dateKey: 'dateJan2026', tagKey: 'tagImprovement', icon: BarChart3 },
  { id: 'landing', dateKey: 'dateDec2025', tagKey: 'tagNew', icon: Sparkles },
  { id: 'qr', dateKey: 'dateDec2025', tagKey: 'tagNew', icon: Smartphone },
];

export default function NouveautesPage() {
  const t = useTranslations('marketing.nouveautes');

  return (
    <>
      {/* Hero */}
      <section className="bg-white dark:bg-neutral-950 pb-12 pt-20 lg:pt-28">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-6 text-4xl font-bold font-[family-name:var(--font-sora)] text-neutral-900 dark:text-white sm:text-5xl"
          >
            {t('pageTitle')}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-lg text-neutral-600 dark:text-neutral-400 sm:text-xl"
          >
            {t('pageSubtitle')}
          </motion.p>
        </div>
      </section>

      {/* Timeline */}
      <section className="bg-neutral-50 dark:bg-neutral-900 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-8">
            {UPDATES.map((update, idx) => {
              const Icon = update.icon;
              return (
                <motion.div
                  key={update.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: idx * 0.05 }}
                  viewport={{ once: true }}
                  className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-8"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800">
                      <Icon className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                        {t(update.dateKey)}
                      </span>
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                        {t(update.tagKey)}
                      </span>
                    </div>
                  </div>
                  <h3 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white">
                    {t(`updates.${update.id}Title` as const)}
                  </h3>
                  <p className="leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {t(`updates.${update.id}Description` as const)}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white dark:bg-neutral-950 py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-6 text-3xl font-bold font-[family-name:var(--font-sora)] text-neutral-900 dark:text-white sm:text-4xl">
            {t('ctaTitle')}
          </h2>
          <p className="mb-10 text-lg text-neutral-600 dark:text-neutral-400">{t('ctaSubtitle')}</p>
          <Button asChild size="lg">
            <Link href="/signup">{t('ctaButton')}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
