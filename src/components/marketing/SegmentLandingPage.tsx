import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shared marketing landing for the 5 vertical-segment pages
 * (quick-service, bars-cafes, fast-food, hotels, restaurants).
 *
 * Structure: hero -> 3 feature cards -> CTA. All copy is fully i18nized
 * under `marketing.landings.<segmentKey>.*`. Pages just provide their
 * segment key and the 3 lucide icons (icons can't be JSON-serialized).
 */

interface SegmentLandingPageProps {
  /** Key under marketing.landings in messages/{fr,en}.json */
  segmentKey: 'quickService' | 'barsCafes' | 'fastFood' | 'hotels' | 'restaurants';
  /** Three icons for the feature cards (in order). */
  icons: [LucideIcon, LucideIcon, LucideIcon];
}

export async function SegmentLandingPage({ segmentKey, icons }: SegmentLandingPageProps) {
  const t = await getTranslations(`marketing.landings.${segmentKey}`);
  const tShared = await getTranslations('marketing.landings.shared');

  const features = [
    { Icon: icons[0], title: t('feature1Title'), description: t('feature1Description') },
    { Icon: icons[1], title: t('feature2Title'), description: t('feature2Description') },
    { Icon: icons[2], title: t('feature3Title'), description: t('feature3Description') },
  ];

  return (
    <>
      {/* Hero */}
      <section className="py-20 lg:py-28 bg-white dark:bg-neutral-950">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-[family-name:var(--font-sora)] text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 dark:text-white tracking-tight">
            {t('heroTitle')}
          </h1>
          <p className="text-lg sm:text-xl text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto mt-6">
            {t('heroSubtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <Button asChild size="lg">
              <Link href="/signup">{tShared('ctaPrimary')}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">{tShared('ctaSecondary')}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features - 3 cards */}
      <section className="py-20 bg-neutral-50 dark:bg-neutral-900">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map(({ Icon, title, description }) => (
              <div
                key={title}
                className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-8"
              >
                <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center mb-5">
                  <Icon className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
                  {title}
                </h3>
                <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-white dark:bg-neutral-950">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-[family-name:var(--font-sora)] text-3xl sm:text-4xl font-bold text-neutral-900 dark:text-white">
            {t('ctaTitle')}
          </h2>
          <p className="text-lg text-neutral-500 dark:text-neutral-400 mt-4">
            {tShared('ctaSubtitle')}
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/signup">{tShared('ctaPrimary')}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
