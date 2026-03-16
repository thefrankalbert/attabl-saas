import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Comment digitaliser votre boutique avec un catalogue en ligne',
  description:
    'Du catalogue papier au catalogue digital : étapes pratiques pour les boutiques, épiceries et commerces de détail en Afrique.',
  openGraph: {
    title: 'Comment digitaliser votre boutique avec un catalogue en ligne',
    description: 'Étapes pratiques pour créer un catalogue digital pour votre commerce en Afrique.',
    type: 'article',
  },
};

export default function ArticleCataloguePage() {
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
            <span className="rounded-full bg-[#CCFF00]/10 px-2.5 py-0.5 text-xs font-medium text-[#0A0A0F]">
              Digital
            </span>
            <span>8 mars 2026</span>
            <span>&middot;</span>
            <span>6 min de lecture</span>
          </div>
          <h1 className="font-[family-name:var(--font-sora)] text-3xl font-bold leading-tight text-neutral-900 sm:text-4xl">
            Comment digitaliser votre boutique avec un catalogue en ligne
          </h1>
        </header>

        <div className="prose prose-neutral prose-lg max-w-none [&>h2]:font-[family-name:var(--font-sora)] [&>h2]:text-2xl [&>h2]:font-bold [&>h2]:mt-12 [&>h2]:mb-4 [&>p]:text-neutral-600 [&>p]:leading-relaxed [&>p]:mb-6 [&>ul]:text-neutral-600 [&>ul]:mb-6 [&>ul>li]:mb-2">
          <p>
            En Afrique, des millions de boutiques, épiceries et commerces de détail fonctionnent
            encore avec des catalogues papier — ou pas de catalogue du tout. Pourtant, la
            digitalisation de votre offre produit est devenue un levier de croissance
            incontournable, même pour les petits commerces.
          </p>

          <h2>Pourquoi digitaliser votre boutique</h2>
          <p>
            Un catalogue digital ne remplace pas votre boutique physique — il la complète. Vos
            clients peuvent consulter vos produits avant de se déplacer, comparer les prix, et même
            passer commande à distance. Pour le commerçant, c&apos;est une vitrine ouverte 24h/24
            sans frais supplémentaires de personnel.
          </p>
          <p>
            Les commerçants qui digitalisent leur catalogue constatent en moyenne une augmentation
            de 20 à 35% de leur chiffre d&apos;affaires dans les six premiers mois. La raison est
            simple : plus de visibilité entraîne plus de clients.
          </p>

          <h2>Les avantages du catalogue digital</h2>
          <ul>
            <li>
              <strong>Visibilité permanente</strong> — Vos produits sont accessibles en ligne à tout
              moment, depuis un smartphone ou un ordinateur
            </li>
            <li>
              <strong>Mise à jour instantanée</strong> — Changez un prix, ajoutez un produit ou
              signalez une rupture de stock en quelques secondes
            </li>
            <li>
              <strong>Partage facile</strong> — Envoyez votre catalogue par WhatsApp, affichez un QR
              code en boutique, ou partagez le lien sur les réseaux sociaux
            </li>
            <li>
              <strong>Données clients</strong> — Comprenez quels produits sont les plus consultés et
              adaptez votre offre en conséquence
            </li>
          </ul>

          <h2>Étapes de mise en place</h2>
          <p>
            La création d&apos;un catalogue digital est plus simple qu&apos;il n&apos;y paraît.
            Commencez par photographier vos produits phares avec votre smartphone — la lumière
            naturelle suffit. Ensuite, saisissez les informations essentielles : nom, prix,
            description courte et catégorie.
          </p>
          <p>
            Avec un outil comme ATTABL, vous pouvez créer votre catalogue en moins d&apos;une heure.
            L&apos;interface est conçue pour fonctionner sur mobile, avec une connexion internet
            minimale — une réalité importante pour de nombreuses zones en Afrique.
          </p>
          <p>
            Une fois votre catalogue en ligne, générez un QR code et affichez-le dans votre
            boutique. Vos clients habitués découvriront votre catalogue digital naturellement, et
            les nouveaux clients pourront vous trouver en ligne.
          </p>

          <h2>Conclusion</h2>
          <p>
            La digitalisation n&apos;est pas réservée aux grandes surfaces. Que vous vendiez des
            vêtements à Libreville, des produits cosmétiques à Kinshasa ou des fournitures de bureau
            à Yaoundé, un catalogue en ligne vous donne un avantage concurrentiel réel. Le tout sans
            investissement lourd — juste un smartphone et la volonté d&apos;avancer.
          </p>
        </div>

        <div className="mt-16 border-t border-neutral-200 pt-12">
          <p className="mb-4 text-sm text-neutral-500">Prêt à créer votre catalogue digital ?</p>
          <Link
            href="/signup"
            className="inline-flex items-center rounded-full bg-[#0A0A0F] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
          >
            Essayer ATTABL gratuitement
          </Link>
        </div>
      </div>
    </article>
  );
}
