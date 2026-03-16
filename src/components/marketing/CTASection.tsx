'use client';

import Link from 'next/link';

export default function CTASection() {
  return (
    <section className="bg-neutral-900 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="mx-auto max-w-2xl font-[family-name:var(--font-sora)] text-3xl font-bold text-white sm:text-4xl">
          Votre commerce mérite mieux qu{"'"}un carnet et une calculette.
        </h2>
        <p className="mt-4 text-neutral-400">Créez votre compte en 2 minutes.</p>
        <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
          <Link
            href="/signup"
            className="inline-block rounded-lg bg-white px-8 py-4 font-semibold text-neutral-900 transition-colors hover:bg-neutral-100"
          >
            Créer mon compte gratuit
          </Link>
          <Link
            href="/contact"
            className="inline-block rounded-lg border border-neutral-600 px-8 py-4 font-semibold text-white transition-colors hover:bg-neutral-800"
          >
            Parler à un conseiller
          </Link>
        </div>
        <p className="mt-6 text-sm text-neutral-500">
          14 jours gratuits &middot; Aucune carte bancaire requise &middot; Support WhatsApp 24/7
        </p>
      </div>
    </section>
  );
}
