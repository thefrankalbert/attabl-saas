import { getTranslations } from 'next-intl/server';

type CardKey = 'pilot' | 'sell' | 'prepare' | 'cashIn' | 'manage';

const cardDefs: { key: CardKey; span: number; hero?: boolean }[] = [
  { key: 'pilot', span: 2, hero: true },
  { key: 'sell', span: 1 },
  { key: 'prepare', span: 1 },
  { key: 'cashIn', span: 1 },
  { key: 'manage', span: 1 },
];

export default async function ProductShowcase() {
  const t = await getTranslations('marketing.home.productShowcase');

  const products = cardDefs.map(({ key, span, hero }) => ({
    key,
    span,
    hero,
    verb: t(`cards.${key}.verb`),
    title: t(`cards.${key}.title`),
    description: t(`cards.${key}.description`),
  }));

  return (
    <section className="bg-neutral-50 dark:bg-neutral-900 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mb-16 text-center">
          <h2 className="font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 dark:text-white sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-neutral-500 dark:text-neutral-400">
            {t('subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {products.map((product) => (
            <div
              key={product.key}
              className={`rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-8 transition-shadow hover:shadow-lg ${
                product.span === 2 ? 'md:col-span-2' : ''
              }`}
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                {product.verb}
              </p>
              <h3 className="mb-2 text-xl font-bold text-neutral-900 dark:text-white">
                {product.title}
              </h3>
              <p className="leading-relaxed text-neutral-600 dark:text-neutral-400">
                {product.description}
              </p>

              {/* Mini mockup for hero card */}
              {product.hero && (
                <div className="mt-6 flex gap-4">
                  {/* Mini bar chart 1 */}
                  <div className="flex-1 rounded-xl bg-neutral-50 dark:bg-neutral-900 p-4">
                    <p className="mb-2 text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
                      {t('revenueLabel')}
                    </p>
                    <div className="flex h-16 items-end gap-1">
                      {[40, 65, 50, 80, 70, 90, 75].map((h, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-sm ${i === 5 ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                  {/* Mini bar chart 2 */}
                  <div className="flex-1 rounded-xl bg-neutral-50 dark:bg-neutral-900 p-4">
                    <p className="mb-2 text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
                      {t('ordersLabel')}
                    </p>
                    <div className="flex h-16 items-end gap-1">
                      {[55, 70, 85, 60, 95, 45, 80].map((h, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-sm ${i === 4 ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-200 dark:bg-neutral-700'}`}
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
