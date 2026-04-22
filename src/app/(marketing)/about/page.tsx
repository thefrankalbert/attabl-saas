import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'À propos',
  description:
    "Découvrez ATTABL, la plateforme SaaS de gestion digitale pour la restauration et l'hôtellerie.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-8">
        &Agrave; propos d&apos;ATTABL
      </h1>

      <div className="prose prose-neutral max-w-none space-y-6 text-neutral-600 dark:text-neutral-400">
        <p className="text-lg">
          ATTABL est une plateforme SaaS con&ccedil;ue pour digitaliser la gestion des restaurants,
          h&ocirc;tels et &eacute;tablissements de restauration. Notre mission : simplifier le
          quotidien des restaurateurs gr&acirc;ce &agrave; des outils modernes et intuitifs.
        </p>

        <h2 className="text-xl font-bold text-neutral-900 dark:text-white mt-8">Notre vision</h2>
        <p>
          Nous croyons que chaque &eacute;tablissement, du petit bistrot au grand h&ocirc;tel,
          m&eacute;rite des outils digitaux performants. ATTABL offre un menu QR code, un
          syst&egrave;me de commandes en temps r&eacute;el, un POS tactile, un affichage cuisine
          (KDS), et des analytics avanc&eacute;s - le tout dans une seule plateforme.
        </p>

        <h2 className="text-xl font-bold text-neutral-900 dark:text-white mt-8">Technologie</h2>
        <p>
          Construite avec les technologies les plus r&eacute;centes (Next.js, React, Supabase,
          Tailwind CSS), ATTABL est rapide, s&eacute;curis&eacute;e et disponible en tant que
          Progressive Web App (PWA) sur tous les appareils.
        </p>

        <div className="mt-12 flex gap-4">
          <Link
            href="/contact"
            className="inline-flex items-center rounded-[10px] bg-neutral-900 dark:bg-white px-6 py-3 text-sm font-bold text-white dark:text-neutral-900 transition-colors hover:bg-neutral-800 dark:hover:bg-neutral-200"
          >
            Nous contacter
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-[10px] border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-6 py-3 text-sm font-bold text-neutral-900 dark:text-white transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            Voir les tarifs
          </Link>
        </div>
      </div>
    </div>
  );
}
