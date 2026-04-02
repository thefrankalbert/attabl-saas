import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gestion de stock en restauration : le guide complet',
  description:
    'Comment digitaliser la gestion de vos stocks en cuisine pour éviter les ruptures et optimiser vos commandes fournisseurs. Guide pratique pour restaurants et hôtels en Afrique.',
  openGraph: {
    title: 'Gestion de stock en restauration : le guide complet',
    description: 'Guide pratique pour digitaliser vos stocks en restauration en Afrique.',
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
            className="text-sm text-neutral-400 dark:text-neutral-500 transition-colors hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            &larr; Retour au blog
          </Link>
        </div>

        <header className="mb-12">
          <div className="mb-4 flex items-center gap-3 text-sm text-neutral-400 dark:text-neutral-500">
            <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2.5 py-0.5 text-xs font-medium text-neutral-900 dark:text-white">
              Gestion
            </span>
            <span>12 mars 2026</span>
            <span>&middot;</span>
            <span>8 min de lecture</span>
          </div>
          <h1 className="font-[family-name:var(--font-sora)] text-3xl font-bold leading-tight text-neutral-900 dark:text-white sm:text-4xl">
            Gestion de stock en restauration : le guide complet pour les professionnels
          </h1>
        </header>

        <div className="prose prose-neutral dark:prose-invert prose-lg max-w-none [&>h2]:font-[family-name:var(--font-sora)] [&>h2]:text-2xl [&>h2]:font-bold [&>h2]:mt-12 [&>h2]:mb-4 [&>p]:text-neutral-600 dark:[&>p]:text-neutral-400 [&>p]:leading-relaxed [&>p]:mb-6 [&>ul]:text-neutral-600 dark:[&>ul]:text-neutral-400 [&>ul]:mb-6 [&>ul>li]:mb-2">
          <p>
            La gestion de stock est le nerf de la guerre pour tout restaurant ou hôtel en Afrique.
            Qu&apos;il s&apos;agisse d&apos;un restaurant à Douala, d&apos;un hôtel à Abidjan ou
            d&apos;un service traiteur à Dakar, les ruptures de stock en cuisine représentent une
            perte de chiffre d&apos;affaires directe et une atteinte à la satisfaction client.
          </p>

          <h2>Pourquoi la gestion de stock est critique en restauration</h2>
          <p>
            En Afrique, les délais de réapprovisionnement sont souvent plus longs et plus
            imprévisibles qu&apos;ailleurs. Les chaînes logistiques sont complexes, les fournisseurs
            multiples, et les fluctuations de prix fréquentes. Sans un suivi rigoureux, les
            restaurateurs se retrouvent avec soit trop de stock (gaspillage alimentaire), soit pas
            assez (plats indisponibles).
          </p>
          <ul>
            <li>
              <strong>Ruptures fréquentes</strong> - 34% des restaurants africains déclarent retirer
              des plats de la carte chaque semaine à cause de ruptures
            </li>
            <li>
              <strong>Gaspillage alimentaire</strong> - Le sur-stockage en cuisine coûte en moyenne
              15-20% du budget ingrédients en pertes
            </li>
            <li>
              <strong>Manque de visibilité</strong> - Sans outil digital, il est impossible de
              connaître son stock exact en temps réel
            </li>
          </ul>

          <h2>Les étapes pour digitaliser vos stocks en cuisine</h2>
          <p>
            La transition du cahier papier vers un outil digital ne se fait pas en un jour. Voici
            les étapes clés pour une migration réussie.
          </p>

          <h2>1. Inventaire initial</h2>
          <p>
            Commencez par un inventaire complet de tous vos ingrédients et produits. Notez pour
            chaque article : le nom, la référence fournisseur, le prix d&apos;achat, l&apos;unité de
            mesure et la quantité en stock. C&apos;est la base de votre gestion digitale.
          </p>

          <h2>2. Choisissez un outil adapté</h2>
          <p>
            Un bon outil de gestion de stock pour la restauration en Afrique doit supporter
            plusieurs devises (XAF, EUR, USD), fonctionner sur mobile (même en cuisine), et proposer
            des alertes de réapprovisionnement automatiques. ATTABL offre toutes ces fonctionnalités
            nativement.
          </p>

          <h2>3. Configurez vos alertes</h2>
          <p>
            Définissez des seuils d&apos;alerte pour chaque ingrédient. Quand le stock descend en
            dessous du seuil, l&apos;outil vous prévient automatiquement. Plus besoin de vérifier
            manuellement le frigo chaque matin.
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
            chaînes hôtelières. Des outils comme ATTABL permettent à tout restaurant - du petit
            maquis de quartier au restaurant gastronomique - de suivre ses stocks en temps réel, de
            prévenir les ruptures et d&apos;optimiser ses achats.
          </p>
        </div>

        <div className="mt-16 border-t border-neutral-200 dark:border-neutral-800 pt-12">
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            Prêt à digitaliser vos stocks en cuisine ?
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center rounded-lg bg-neutral-900 dark:bg-white px-6 py-3 text-sm font-semibold text-white dark:text-neutral-900 transition-colors hover:bg-neutral-800 dark:hover:bg-neutral-200"
          >
            Essayer ATTABL gratuitement
          </Link>
        </div>
      </div>
    </article>
  );
}
