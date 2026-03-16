import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gestion de stock en Afrique : le guide complet',
  description:
    'Comment digitaliser la gestion de vos stocks pour éviter les ruptures et optimiser vos commandes fournisseurs. Guide pratique pour commerçants africains.',
  openGraph: {
    title: 'Gestion de stock en Afrique : le guide complet',
    description: 'Guide pratique pour digitaliser vos stocks en Afrique.',
    type: 'article',
  },
};

export default function ArticleStockPage() {
  return (
    <article className="py-20 lg:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <Link
            href="/blog"
            className="text-sm text-neutral-400 transition-colors hover:text-neutral-600"
          >
            &larr; Retour au blog
          </Link>
        </div>

        <header className="mb-12">
          <div className="mb-4 flex items-center gap-3 text-sm text-neutral-400">
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-900">
              Gestion
            </span>
            <span>12 mars 2026</span>
            <span>&middot;</span>
            <span>8 min de lecture</span>
          </div>
          <h1 className="font-[family-name:var(--font-sora)] text-3xl font-bold leading-tight text-neutral-900 sm:text-4xl">
            Gestion de stock en Afrique : le guide complet pour les commerçants
          </h1>
        </header>

        <div className="prose prose-neutral prose-lg max-w-none [&>h2]:font-[family-name:var(--font-sora)] [&>h2]:text-2xl [&>h2]:font-bold [&>h2]:mt-12 [&>h2]:mb-4 [&>p]:text-neutral-600 [&>p]:leading-relaxed [&>p]:mb-6 [&>ul]:text-neutral-600 [&>ul]:mb-6 [&>ul>li]:mb-2">
          <p>
            La gestion de stock est le nerf de la guerre pour tout commerce en Afrique. Qu&apos;il
            s&apos;agisse d&apos;une épicerie à Douala, d&apos;une pharmacie à Abidjan ou d&apos;une
            boutique de mode à Dakar, les ruptures de stock représentent une perte de chiffre
            d&apos;affaires directe et une atteinte à la fidélité client.
          </p>

          <h2>Pourquoi la gestion de stock est critique en Afrique</h2>
          <p>
            En Afrique, les délais de réapprovisionnement sont souvent plus longs et plus
            imprévisibles qu&apos;ailleurs. Les chaînes logistiques sont complexes, les fournisseurs
            multiples, et les fluctuations de prix fréquentes. Sans un suivi rigoureux, les
            commerçants se retrouvent avec soit trop de stock (capital immobilisé), soit pas assez
            (ventes perdues).
          </p>
          <ul>
            <li>
              <strong>Ruptures fréquentes</strong> — 34% des commerces africains déclarent perdre
              des ventes chaque semaine à cause de ruptures
            </li>
            <li>
              <strong>Capital immobilisé</strong> — Le sur-stockage coûte en moyenne 15-20% de la
              valeur du stock en frais de stockage
            </li>
            <li>
              <strong>Manque de visibilité</strong> — Sans outil digital, il est impossible de
              connaître son stock exact en temps réel
            </li>
          </ul>

          <h2>Les étapes pour digitaliser vos stocks</h2>
          <p>
            La transition du cahier papier vers un outil digital ne se fait pas en un jour. Voici
            les étapes clés pour une migration réussie.
          </p>

          <h2>1. Inventaire initial</h2>
          <p>
            Commencez par un inventaire complet de tous vos produits. Notez pour chaque article : le
            nom, la référence fournisseur, le prix d&apos;achat, le prix de vente, et la quantité en
            stock. C&apos;est la base de votre catalogue digital.
          </p>

          <h2>2. Choisissez un outil adapté</h2>
          <p>
            Un bon outil de gestion de stock pour l&apos;Afrique doit supporter plusieurs devises
            (XAF, EUR, USD), fonctionner sur mobile (pas toujours un ordinateur à portée de main),
            et proposer des alertes de réapprovisionnement automatiques. ATTABL offre toutes ces
            fonctionnalités nativement.
          </p>

          <h2>3. Configurez vos alertes</h2>
          <p>
            Définissez des seuils d&apos;alerte pour chaque produit. Quand le stock descend en
            dessous du seuil, l&apos;outil vous prévient automatiquement. Plus besoin de vérifier
            manuellement.
          </p>

          <h2>4. Suivez vos fournisseurs</h2>
          <p>
            Centralisez les informations de vos fournisseurs : contacts, délais de livraison moyens,
            historique de commandes. Cela vous permet de passer commande au bon moment et au bon
            fournisseur.
          </p>

          <h2>Conclusion</h2>
          <p>
            La digitalisation de la gestion de stock n&apos;est plus un luxe réservé aux grandes
            enseignes. Des outils comme ATTABL permettent à tout commerce — de la petite épicerie de
            quartier au réseau de pharmacies — de suivre ses stocks en temps réel, de prévenir les
            ruptures et d&apos;optimiser ses achats.
          </p>
        </div>

        <div className="mt-16 border-t border-neutral-200 pt-12">
          <p className="mb-4 text-sm text-neutral-500">Prêt à digitaliser vos stocks ?</p>
          <Link
            href="/signup"
            className="inline-flex items-center rounded-lg bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
          >
            Essayer ATTABL gratuitement
          </Link>
        </div>
      </div>
    </article>
  );
}
