import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation",
  description: "Conditions générales d'utilisation de la plateforme ATTABL.",
};

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-8">
        Conditions G&eacute;n&eacute;rales d&apos;Utilisation
      </h1>

      <div className="prose prose-neutral max-w-none space-y-6 text-neutral-600 dark:text-neutral-400">
        <p className="text-sm text-neutral-400 dark:text-neutral-500">
          Derni&egrave;re mise &agrave; jour : 28 f&eacute;vrier 2026
        </p>

        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mt-8">1. Objet</h2>
        <p>
          Les pr&eacute;sentes Conditions G&eacute;n&eacute;rales d&apos;Utilisation (CGU)
          r&eacute;gissent l&apos;acc&egrave;s et l&apos;utilisation de la plateforme ATTABL, un
          service SaaS de gestion digitale pour la restauration et l&apos;h&ocirc;tellerie.
        </p>

        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mt-8">
          2. Acc&egrave;s au service
        </h2>
        <p>
          L&apos;acc&egrave;s &agrave; ATTABL n&eacute;cessite la cr&eacute;ation d&apos;un compte
          utilisateur. L&apos;utilisateur s&apos;engage &agrave; fournir des informations exactes et
          &agrave; jour lors de son inscription.
        </p>

        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mt-8">
          3. Abonnements et tarifs
        </h2>
        <p>
          ATTABL propose des plans d&apos;abonnement mensuels et annuels. Les tarifs en vigueur sont
          disponibles sur la page{' '}
          <a
            href="/pricing"
            className="text-neutral-900 dark:text-white font-semibold hover:underline"
          >
            Tarifs
          </a>
          . Toute modification tarifaire sera communiqu&eacute;e 30 jours &agrave; l&apos;avance.
        </p>

        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mt-8">
          4. Propri&eacute;t&eacute; des donn&eacute;es
        </h2>
        <p>
          Les donn&eacute;es saisies par l&apos;utilisateur (menus, commandes, clients) restent sa
          propri&eacute;t&eacute; exclusive. ATTABL s&apos;engage &agrave; ne pas commercialiser ces
          donn&eacute;es.
        </p>

        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mt-8">5. Contact</h2>
        <p>
          Pour toute question relative aux pr&eacute;sentes CGU, contactez-nous &agrave;{' '}
          <a
            href="mailto:contact@attabl.com"
            className="text-neutral-900 dark:text-white font-semibold hover:underline"
          >
            contact@attabl.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
