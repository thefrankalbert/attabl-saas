'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Article = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readTime: string;
};

// FR article content (real blog posts, kept as content). EN blog content is a future pass.
const ARTICLES: Article[] = [
  {
    slug: 'gestion-stock-commerce-afrique',
    title: 'Gestion de stock en Afrique : le guide complet pour les commerçants',
    excerpt:
      'Comment digitaliser la gestion de vos stocks pour éviter les ruptures et optimiser vos commandes fournisseurs.',
    category: 'Gestion',
    date: '12 mars 2026',
    readTime: '8 min',
  },
  {
    slug: 'menu-qr-code-restaurant',
    title: 'Menu QR code : pourquoi chaque restaurant devrait en avoir un',
    excerpt:
      "Du papier au digital : comment le menu QR transforme l'expérience client et simplifie la gestion.",
    category: 'Restauration',
    date: '8 mars 2026',
    readTime: '6 min',
  },
  {
    slug: 'pos-mobile-money-afrique',
    title: 'POS et Mobile Money : encaisser sans friction en Afrique',
    excerpt:
      'Cash, carte, mobile money - comment proposer tous les moyens de paiement à vos clients avec un seul outil.',
    category: 'Paiements',
    date: '3 mars 2026',
    readTime: '5 min',
  },
];

const ALL = '__all__';
const CATEGORIES = Array.from(new Set(ARTICLES.map((a) => a.category)));

function Meta({ article, readingSuffix }: { article: Article; readingSuffix: string }) {
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
      <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
      {article.category}
      <span className="text-zinc-300 dark:text-zinc-600">-</span>
      <span className="font-medium normal-case tracking-normal text-zinc-500 dark:text-zinc-400">
        {article.date} - {article.readTime} {readingSuffix}
      </span>
    </span>
  );
}

export default function BlogPage() {
  const t = useTranslations('marketing.blog');
  const [cat, setCat] = useState(ALL);
  const list = cat === ALL ? ARTICLES : ARTICLES.filter((a) => a.category === cat);
  const featured = list[0];
  const rest = list.slice(1);
  const readingSuffix = t('readingSuffix');

  return (
    <>
      {/* Header */}
      <section className="bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-[1120px] px-5 pb-8 pt-20 sm:px-7 sm:pt-[80px]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            {t('eyebrow')}
          </p>
          <h1 className="mt-3 text-[40px] font-semibold leading-[1.04] tracking-[-0.035em] text-zinc-950 lg:text-[52px] dark:text-zinc-50">
            {t('title')}
          </h1>
          <p className="mt-4 max-w-[560px] text-[19px] leading-[1.5] text-zinc-600 dark:text-zinc-400">
            {t('subtitle')}
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            {[ALL, ...CATEGORIES].map((c) => (
              <Button
                key={c}
                type="button"
                variant="ghost"
                onClick={() => setCat(c)}
                aria-pressed={cat === c}
                className={cn(
                  'h-auto rounded-full border px-[15px] py-2 text-[13px] font-medium transition-colors',
                  cat === c
                    ? 'border-zinc-900 bg-zinc-900 text-zinc-50 hover:bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900',
                )}
              >
                {c === ALL ? t('all') : c}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Featured */}
      {featured && (
        <section className="bg-white dark:bg-zinc-950">
          <div className="mx-auto max-w-[1120px] px-5 sm:px-7">
            <Link
              href={`/blog/${featured.slug}`}
              className="group grid grid-cols-1 overflow-hidden rounded-2xl border border-zinc-200 bg-white lg:grid-cols-[1.1fr_1fr] dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex flex-col justify-center p-8 sm:p-11">
                <Meta article={featured} readingSuffix={readingSuffix} />
                <h2 className="mt-4 text-[28px] font-semibold leading-[1.12] tracking-[-0.03em] text-zinc-950 transition-colors group-hover:text-zinc-600 sm:text-[32px] dark:text-zinc-50 dark:group-hover:text-zinc-300">
                  {featured.title}
                </h2>
                <p className="mt-3.5 text-base leading-[1.55] text-zinc-600 dark:text-zinc-400">
                  {featured.excerpt}
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-[13px] font-semibold text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
                    AT
                  </span>
                  <div className="text-[13px] leading-[1.3]">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {t('author')}
                    </div>
                    <div className="text-zinc-500 dark:text-zinc-400">
                      {featured.date} - {featured.readTime} {t('readingSuffix')}
                    </div>
                  </div>
                </div>
              </div>
              <div className="relative min-h-[220px] overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-700 lg:min-h-[340px]">
                <div className="absolute inset-6 overflow-hidden rounded-[14px] border border-white/15 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
                  <Image
                    src="/marketing/screen-inventaire.png"
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 100vw, 500px"
                    className="object-cover object-left-top"
                  />
                </div>
              </div>
            </Link>
          </div>
        </section>
      )}

      {/* Grid */}
      {rest.length > 0 && (
        <section className="bg-white dark:bg-zinc-950">
          <div className="mx-auto max-w-[1120px] px-5 py-10 sm:px-7">
            <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((a) => (
                <Link
                  key={a.slug}
                  href={`/blog/${a.slug}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="aspect-[16/9] bg-gradient-to-br from-zinc-900 to-zinc-700" />
                  <div className="flex flex-1 flex-col p-6">
                    <Meta article={a} readingSuffix={readingSuffix} />
                    <h3 className="mt-3 text-lg font-semibold leading-[1.2] tracking-[-0.02em] text-zinc-950 transition-colors group-hover:text-zinc-600 dark:text-zinc-50 dark:group-hover:text-zinc-300">
                      {a.title}
                    </h3>
                    <p className="mt-2 text-sm leading-[1.55] text-zinc-600 dark:text-zinc-400">
                      {a.excerpt}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="bg-white px-5 pb-[110px] pt-2 sm:px-7 dark:bg-zinc-950">
        <div className="mx-auto max-w-[1120px] rounded-3xl border border-zinc-200 bg-zinc-50 px-6 py-14 text-center sm:px-10 dark:border-zinc-800 dark:bg-zinc-900/40">
          <h2 className="text-[26px] font-semibold tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
            {t('cta.title')}
          </h2>
          <p className="mt-2.5 text-sm text-zinc-500 dark:text-zinc-400">{t('cta.subtitle')}</p>
          <Link
            href="/signup"
            className="mt-5 inline-flex items-center rounded-lg bg-zinc-900 px-[22px] py-2.5 text-sm font-semibold text-zinc-50 transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {t('cta.button')}
          </Link>
        </div>
      </section>
    </>
  );
}
