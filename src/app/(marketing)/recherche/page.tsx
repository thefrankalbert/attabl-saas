import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SearchClient, type SearchEntry } from './SearchClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing.recherche');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: false, follow: true },
  };
}

const PAGES = [
  { key: 'solutions', href: '/solutions' },
  { key: 'features', href: '/features' },
  { key: 'pricing', href: '/pricing' },
  { key: 'materiel', href: '/materiel' },
  { key: 'nouveautes', href: '/nouveautes' },
  { key: 'blog', href: '/blog' },
  { key: 'about', href: '/about' },
  { key: 'contact', href: '/contact' },
] as const;

export default async function RecherchePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const t = await getTranslations('marketing.recherche');

  const entries: SearchEntry[] = PAGES.map(({ key, href }) => ({
    href,
    title: t(`pages.${key}.title`),
    description: t(`pages.${key}.description`),
  }));

  return (
    <section className="bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-[760px] px-5 pb-24 pt-20 sm:px-7 sm:pt-[88px]">
        <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-zinc-950 dark:text-zinc-50">
          {t('title')}
        </h1>
        <p className="mt-2.5 text-base leading-[1.5] text-zinc-500 dark:text-zinc-400">
          {t('subtitle')}
        </p>
        <div className="mt-9">
          <SearchClient
            entries={entries}
            initialQuery={q ?? ''}
            placeholder={t('placeholder')}
            label={t('label')}
            emptyLabel={t('empty')}
          />
        </div>
      </div>
    </section>
  );
}
