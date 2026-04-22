import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Menu QR code : pourquoi chaque restaurant devrait en avoir un',
  description:
    "Du papier au digital : comment le menu QR transforme l'expérience client et simplifie la gestion pour les restaurants en Afrique.",
  openGraph: {
    title: 'Menu QR code : pourquoi chaque restaurant devrait en avoir un',
    description:
      "Comment le menu QR code transforme l'expérience client et simplifie la gestion en restauration.",
    type: 'article',
  },
};

export default function ArticleMenuQrPage() {
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
            <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2.5 py-0.5 text-xs font-normal text-neutral-900 dark:text-white">
              Restauration
            </span>
            <span>8 mars 2026</span>
            <span>&middot;</span>
            <span>6 min de lecture</span>
          </div>
          <h1 className="font-[family-name:var(--font-sora)] text-3xl font-bold leading-tight text-neutral-900 dark:text-white sm:text-4xl">
            Menu QR code : pourquoi chaque restaurant devrait en avoir un
          </h1>
        </header>

        <div className="prose prose-neutral dark:prose-invert prose-lg max-w-none [&>h2]:font-[family-name:var(--font-sora)] [&>h2]:text-2xl [&>h2]:font-bold [&>h2]:mt-12 [&>h2]:mb-4 [&>p]:text-neutral-600 dark:[&>p]:text-neutral-400 [&>p]:leading-relaxed [&>p]:mb-6 [&>ul]:text-neutral-600 dark:[&>ul]:text-neutral-400 [&>ul]:mb-6 [&>ul>li]:mb-2">
          <p>
            Le menu papier a longtemps été le standard dans la restauration. Mais en Afrique comme
            ailleurs, les habitudes changent. Les clients veulent consulter le menu sur leur
            téléphone, passer commande rapidement et ne plus attendre qu&apos;un serveur soit
            disponible. Le menu QR code répond à tous ces besoins.
          </p>

          <h2>Qu&apos;est-ce qu&apos;un menu QR code ?</h2>
          <p>
            Un menu QR code est un menu digital accessible en scannant un code QR avec un
            smartphone. Le client pointe son appareil photo vers le code, et le menu s&apos;affiche
            instantanément dans son navigateur - sans application à télécharger. Il peut consulter
            les plats, voir les photos, lire les descriptions et même passer commande directement.
          </p>

          <h2>Les avantages pour votre restaurant</h2>
          <ul>
            <li>
              <strong>Zéro impression</strong> - Plus besoin de réimprimer les menus à chaque
              changement de prix ou de plat. Mettez à jour votre carte en temps réel depuis votre
              téléphone.
            </li>
            <li>
              <strong>Expérience client moderne</strong> - Vos clients accèdent au menu
              instantanément. Les photos haute qualité des plats augmentent le panier moyen de 15 à
              30%.
            </li>
            <li>
              <strong>Commandes directes</strong> - Le client commande depuis sa table. Moins
              d&apos;attente, moins d&apos;erreurs de prise de commande, et vos serveurs se
              concentrent sur le service.
            </li>
            <li>
              <strong>Multilingue automatique</strong> - Pour les hôtels et restaurants
              touristiques, proposez le menu en français, anglais et d&apos;autres langues sans
              effort supplémentaire.
            </li>
          </ul>

          <h2>Comment mettre en place un menu QR en Afrique</h2>
          <p>
            La mise en place est plus simple qu&apos;on ne le pense. Avec un outil comme ATTABL,
            vous créez votre menu digital en moins d&apos;une heure. Ajoutez vos catégories
            (entrées, plats, desserts, boissons), saisissez vos plats avec prix et descriptions, et
            importez vos photos.
          </p>
          <p>
            ATTABL génère automatiquement un QR code unique pour votre restaurant. Imprimez-le et
            placez-le sur chaque table, au comptoir ou à l&apos;entrée. Vos clients n&apos;ont
            qu&apos;à scanner pour accéder à votre menu - même avec une connexion internet limitée.
          </p>

          <h2>Un investissement qui se rentabilise vite</h2>
          <p>
            Le coût d&apos;un menu QR code est dérisoire comparé aux impressions régulières de menus
            papier. Mais le vrai gain est ailleurs : les restaurants qui passent au menu digital
            constatent une augmentation moyenne de 20% du panier moyen grâce aux photos de plats,
            aux suggestions automatiques et à la facilité de commande.
          </p>
          <p>
            Pour les hôtels, le menu QR simplifie le room service. Le client scanne le code dans sa
            chambre, commande depuis son lit, et la cuisine reçoit la commande instantanément. Plus
            d&apos;appels téléphoniques, plus de malentendus.
          </p>

          <h2>Conclusion</h2>
          <p>
            Le menu QR code n&apos;est plus une tendance passagère - c&apos;est le nouveau standard.
            Pour les restaurants et hôtels en Afrique, c&apos;est une opportunité de moderniser le
            service sans investissement lourd. Un smartphone, un compte ATTABL, et votre menu
            digital est prêt en quelques minutes.
          </p>
        </div>

        <div className="mt-16 border-t border-neutral-200 dark:border-neutral-800 pt-12">
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            Prêt à créer votre menu QR code ?
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center rounded-lg bg-neutral-900 dark:bg-white px-6 py-3 text-sm font-bold text-white dark:text-neutral-900 transition-colors hover:bg-neutral-800 dark:hover:bg-neutral-200"
          >
            Essayer ATTABL gratuitement
          </Link>
        </div>
      </div>
    </article>
  );
}
