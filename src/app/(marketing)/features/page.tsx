'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Smartphone, ShoppingBag, Package, BarChart3, Globe, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type CategoryKey = 'menu' | 'stock' | 'business';

const categoryDefs: { key: CategoryKey; items: { key: string; icon: LucideIcon }[] }[] = [
  {
    key: 'menu',
    items: [
      { key: 'digitalMenu', icon: Smartphone },
      { key: 'serviceModes', icon: ShoppingBag },
    ],
  },
  {
    key: 'stock',
    items: [{ key: 'autoStock', icon: Package }],
  },
  {
    key: 'business',
    items: [
      { key: 'analytics', icon: BarChart3 },
      { key: 'multiCurrency', icon: Globe },
      { key: 'multiTenant', icon: Users },
    ],
  },
];

export default function FeaturesPage() {
  const t = useTranslations('marketing.features');

  return (
    <>
      <section className="py-20 lg:py-28 bg-white dark:bg-neutral-950">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold font-[family-name:var(--font-sora)] text-neutral-900 dark:text-white mb-6">
            {t('heroTitle')}
          </h1>
          <p className="text-lg sm:text-xl text-neutral-600 dark:text-neutral-400">
            {t('heroSubtitle')}
          </p>
        </div>
      </section>

      {categoryDefs.map((cat, catIdx) => (
        <section
          key={cat.key}
          className={`py-20 ${catIdx % 2 === 0 ? 'bg-white dark:bg-neutral-950' : 'bg-neutral-50 dark:bg-neutral-900'}`}
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-12">
              {t(`categories.${cat.key}.title`)}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {cat.items.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.key}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: idx * 0.1 }}
                    viewport={{ once: true }}
                    className="bg-white dark:bg-neutral-950 p-8 rounded-2xl border border-neutral-200 dark:border-neutral-800"
                  >
                    <div className="w-12 h-12 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-6">
                      <Icon className="h-6 w-6 text-neutral-700 dark:text-neutral-300" />
                    </div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
                      {t(`categories.${cat.key}.items.${item.key}.title`)}
                    </h3>
                    <p className="text-neutral-600 dark:text-neutral-400 text-sm">
                      {t(`categories.${cat.key}.items.${item.key}.description`)}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
