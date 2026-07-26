import Link from 'next/link';
import { ArrowLeft, Search, Utensils } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

const POPULAR = [
  { key: 'features', href: '/features' },
  { key: 'pricing', href: '/pricing' },
  { key: 'solutions', href: '/solutions' },
  { key: 'support', href: '/support' },
] as const;

export default async function NotFound() {
  const t = await getTranslations('common');
  const h = await getTranslations('marketing.header');

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center overflow-x-clip bg-white px-5 py-16 text-center font-[family-name:var(--font-geist-sans)] dark:bg-zinc-950">
      <Link href="/" className="mb-10 inline-flex items-center gap-2.5" aria-label="Attabl">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 dark:bg-white">
          <Utensils className="h-5 w-5 text-white dark:text-zinc-950" strokeWidth={2} />
        </span>
        <span className="text-xl font-semibold tracking-[-0.02em] text-zinc-950 dark:text-zinc-50">
          Attabl
        </span>
      </Link>

      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400">
        404
      </p>
      <h1 className="mt-3 max-w-[520px] text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-zinc-950 sm:text-[40px] dark:text-zinc-50">
        {t('notFoundTitle')}
      </h1>
      <p className="mt-3.5 max-w-[440px] text-base leading-[1.5] text-zinc-600 dark:text-zinc-400">
        {t('notFoundDescription')}
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-[10px] bg-zinc-950 px-[22px] py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToHome')}
        </Link>
        <Link
          href="/recherche"
          className="inline-flex items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-[20px] py-3.5 text-[15px] font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          <Search className="h-4 w-4" />
          {t('notFoundSearch')}
        </Link>
      </div>

      <div className="mt-12">
        <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">
          {t('notFoundPopular')}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {POPULAR.map(({ key, href }) => (
            <Link
              key={key}
              href={href}
              className="text-[15px] font-medium text-zinc-700 underline-offset-4 transition-colors hover:text-orange-600 hover:underline dark:text-zinc-300 dark:hover:text-orange-400"
            >
              {h(key)}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
