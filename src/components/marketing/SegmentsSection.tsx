import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { UtensilsCrossed, Hotel, Zap, Wine, Flame } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type CardKey = 'restaurants' | 'hotels' | 'quickService' | 'barsCafes' | 'fastFood';

const cardDefs: { key: CardKey; icon: LucideIcon; href: string }[] = [
  { key: 'restaurants', icon: UtensilsCrossed, href: '/restaurants' },
  { key: 'hotels', icon: Hotel, href: '/hotels' },
  { key: 'quickService', icon: Zap, href: '/quick-service' },
  { key: 'barsCafes', icon: Wine, href: '/bars-cafes' },
  { key: 'fastFood', icon: Flame, href: '/fast-food' },
];

export default async function SegmentsSection() {
  const t = await getTranslations('marketing.home.segmentsSection');

  return (
    <section className="bg-white dark:bg-neutral-950 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <h2 className="mb-4 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 dark:text-white sm:text-4xl">
          {t('title')}
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-base text-neutral-500 dark:text-neutral-400">
          {t('subtitle')}
        </p>

        {/* 5-card grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {cardDefs.map(({ key, icon: Icon, href }) => (
            <div
              key={key}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 transition-shadow hover:shadow-md"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                <Icon className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
              </div>
              <h3 className="mb-2 text-base font-semibold text-neutral-900 dark:text-white">
                {t(`cards.${key}.title`)}
              </h3>
              <p className="mb-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {t(`cards.${key}.description`)}
              </p>
              <Link
                href={href}
                className="text-sm font-medium text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              >
                {t('learnMore')} &rarr;
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
