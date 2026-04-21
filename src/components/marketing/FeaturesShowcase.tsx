import { getTranslations } from 'next-intl/server';
import { Banknote, BarChart3, CreditCard, Package, QrCode, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type CardKey = 'menu' | 'pos' | 'payments' | 'analytics' | 'stock' | 'team';

const cardDefs: { key: CardKey; icon: LucideIcon }[] = [
  { key: 'menu', icon: QrCode },
  { key: 'pos', icon: CreditCard },
  { key: 'payments', icon: Banknote },
  { key: 'analytics', icon: BarChart3 },
  { key: 'stock', icon: Package },
  { key: 'team', icon: Users },
];

export default async function FeaturesShowcase() {
  const t = await getTranslations('marketing.home.featuresShowcase');

  return (
    <section className="bg-neutral-50 dark:bg-neutral-900 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-4 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 dark:text-white sm:text-4xl">
          {t('title')}
        </h2>
        <p className="mb-16 text-center text-base text-neutral-500 dark:text-neutral-400">
          {t('subtitle')}
        </p>

        <div className="grid gap-6 md:grid-cols-3">
          {cardDefs.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-6 transition-shadow hover:shadow-md"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                <Icon className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
              </div>
              <h3 className="mb-2 text-base font-semibold text-neutral-900 dark:text-white">
                {t(`cards.${key}.title`)}
              </h3>
              <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                {t(`cards.${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
