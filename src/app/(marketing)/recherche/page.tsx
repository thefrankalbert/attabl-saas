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

/**
 * Ce que la recherche du site peut trouver.
 *
 * ELLE NE LIT PAS LE CONTENU DES PAGES: elle filtre ces entrees sur leur titre
 * et leur description, rediges a la main dans les fichiers de traduction. Une
 * page absente d'ici est introuvable, et un mot absent de sa description ne
 * donne aucun resultat - meme s'il figure dix fois dans la page.
 *
 * C'est pourquoi les descriptions reprennent les mots que les restaurateurs
 * tapent vraiment (QR code, mobile money, FCFA, stock, caisse, ticket) plutot
 * que du vocabulaire interne.
 *
 * Complete le 2026-11-06: les trois articles du blog, le support et les pages
 * legales manquaient. Quelqu'un qui cherchait "QR code" ou "aide" ne trouvait
 * rien alors que la page existait.
 *
 * EN AJOUTANT UNE PAGE AU SITE, ajouter son entree ici ET sa traduction dans
 * `marketing.recherche.pages` (fr-FR et en-US), sinon elle reste introuvable.
 */
export const PAGES = [
  { key: 'solutions', href: '/solutions' },
  { key: 'features', href: '/features' },
  { key: 'pricing', href: '/pricing' },
  { key: 'materiel', href: '/materiel' },
  { key: 'nouveautes', href: '/nouveautes' },
  { key: 'blog', href: '/blog' },
  { key: 'about', href: '/about' },
  { key: 'contact', href: '/contact' },
  { key: 'support', href: '/support' },
  { key: 'legal', href: '/legal' },
  { key: 'privacy', href: '/privacy' },
  // Articles du blog: c'est le contenu qui amene des visiteurs, et il etait
  // le seul a ne pas etre trouvable.
  { key: 'blogStock', href: '/blog/gestion-stock-commerce-afrique' },
  { key: 'blogQrCode', href: '/blog/menu-qr-code-restaurant' },
  { key: 'blogMobileMoney', href: '/blog/pos-mobile-money-afrique' },
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
