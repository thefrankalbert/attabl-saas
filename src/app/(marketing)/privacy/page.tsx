import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Politique de Confidentialité',
  description: "Politique de confidentialité et protection des données personnelles d'ATTABL.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-8">
        Politique de Confidentialit&eacute;
      </h1>

      <div className="prose prose-neutral max-w-none space-y-6 text-neutral-600 dark:text-neutral-400">
        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          Derni&egrave;re mise &agrave; jour : 28 f&eacute;vrier 2026
        </p>

        <h2 className="text-xl font-bold text-neutral-900 dark:text-white mt-8">
          1. Responsable du traitement
        </h2>
        <p>
          ATTABL, plateforme SaaS de gestion digitale pour la restauration, est responsable du
          traitement des donn&eacute;es personnelles collect&eacute;es via le site attabl.com.
        </p>

        <h2 className="text-xl font-bold text-neutral-900 dark:text-white mt-8">
          2. Donn&eacute;es collect&eacute;es
        </h2>
        <p>
          Nous collectons les donn&eacute;es suivantes : nom, adresse email, informations de
          l&apos;&eacute;tablissement (nom, adresse, t&eacute;l&eacute;phone), et donn&eacute;es de
          navigation (cookies analytiques). Les donn&eacute;es de paiement sont trait&eacute;es
          directement par Stripe et ne sont pas stock&eacute;es sur nos serveurs.
        </p>

        <h2 className="text-xl font-bold text-neutral-900 dark:text-white mt-8">
          3. Finalit&eacute;s
        </h2>
        <p>
          Les donn&eacute;es sont utilis&eacute;es pour : la gestion de votre compte, la fourniture
          du service, la facturation, le support client, et l&apos;am&eacute;lioration de la
          plateforme.
        </p>

        <h2 className="text-xl font-bold text-neutral-900 dark:text-white mt-8">
          4. H&eacute;bergement et s&eacute;curit&eacute;
        </h2>
        <p>
          Les donn&eacute;es sont h&eacute;berg&eacute;es par Supabase (infrastructure cloud
          s&eacute;curis&eacute;e). L&apos;application est d&eacute;ploy&eacute;e sur Vercel. Toutes
          les communications sont chiffr&eacute;es (HTTPS/TLS).
        </p>

        <h2 className="text-xl font-bold text-neutral-900 dark:text-white mt-8">5. Vos droits</h2>
        <p>
          Conform&eacute;ment au RGPD, vous disposez d&apos;un droit d&apos;acc&egrave;s, de
          rectification, de suppression et de portabilit&eacute; de vos donn&eacute;es.
          Contactez-nous &agrave;{' '}
          <a
            href="mailto:contact@attabl.com"
            className="text-neutral-900 dark:text-white font-bold hover:underline"
          >
            contact@attabl.com
          </a>
          .
        </p>

        <h2 className="text-xl font-bold text-neutral-900 dark:text-white mt-8">6. Cookies</h2>
        <p>
          Nous utilisons des cookies essentiels au fonctionnement du service (authentification,
          pr&eacute;f&eacute;rences de langue). Aucun cookie publicitaire n&apos;est utilis&eacute;.
        </p>
      </div>
    </div>
  );
}
