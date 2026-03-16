import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog — Conseils pour Entrepreneurs Africains',
  description: 'Guides pratiques pour digitaliser votre commerce en Afrique.',
};

const articles = [
  {
    slug: 'gestion-stock-commerce-afrique',
    title: 'Gestion de stock en Afrique : le guide complet pour les commerçants',
    excerpt:
      'Découvrez comment digitaliser la gestion de vos stocks pour éviter les ruptures et optimiser vos commandes fournisseurs.',
    category: 'Gestion',
    date: '12 mars 2026',
    readTime: '8 min',
  },
  {
    slug: 'digitaliser-boutique-catalogue-en-ligne',
    title: 'Comment digitaliser votre boutique avec un catalogue en ligne',
    excerpt:
      'Du catalogue papier au catalogue digital : étapes pratiques pour les boutiques, épiceries et commerces de détail.',
    category: 'Digital',
    date: '8 mars 2026',
    readTime: '6 min',
  },
  {
    slug: 'pos-mobile-money-afrique',
    title: 'POS et Mobile Money : encaisser sans friction en Afrique',
    excerpt:
      'Cash, carte, mobile money — comment proposer tous les moyens de paiement à vos clients avec un seul outil.',
    category: 'Paiements',
    date: '3 mars 2026',
    readTime: '5 min',
  },
];

export default function BlogPage() {
  return (
    <section className="py-20 lg:py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h1 className="font-[family-name:var(--font-sora)] text-4xl font-bold text-neutral-900 sm:text-5xl mb-4">
          Blog
        </h1>
        <p className="text-lg text-neutral-500 mb-16">
          Conseils pratiques et ressources pour digitaliser votre activité en Afrique.
        </p>

        <div className="space-y-12">
          {articles.map((article) => (
            <article key={article.slug} className="group">
              <Link href={`/blog/${article.slug}`} className="block">
                <div className="mb-3 flex items-center gap-3 text-sm text-neutral-400">
                  <span className="rounded-full bg-[#CCFF00]/10 px-2.5 py-0.5 text-xs font-medium text-[#0A0A0F]">
                    {article.category}
                  </span>
                  <span>{article.date}</span>
                  <span>&middot;</span>
                  <span>{article.readTime} de lecture</span>
                </div>
                <h2 className="mb-2 text-2xl font-bold text-neutral-900 transition-colors group-hover:text-[#0A0A0F]/70">
                  {article.title}
                </h2>
                <p className="leading-relaxed text-neutral-600">{article.excerpt}</p>
                <span className="mt-4 inline-block text-sm font-semibold text-neutral-900 group-hover:underline">
                  Lire l&apos;article &rarr;
                </span>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
