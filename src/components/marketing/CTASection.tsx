'use client';

import Link from 'next/link';

export default function CTASection() {
  return (
    <section className="bg-neutral-900 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="mx-auto max-w-2xl font-[family-name:var(--font-sora)] text-3xl font-bold text-white sm:text-4xl">
          Votre commerce m\u00e9rite mieux qu&apos;un carnet et une calculette.
        </h2>
        <p className="mt-4 text-neutral-400">Cr\u00e9ez votre compte en 2 minutes.</p>
        <Link
          href="/signup"
          className="mt-8 inline-block rounded-lg bg-white px-8 py-4 font-semibold text-neutral-900 transition-colors hover:bg-neutral-100"
        >
          D\u00e9marrer gratuitement
        </Link>
        <p className="mt-6 text-sm text-neutral-500">
          Essai gratuit 14 jours &middot; Sans carte bancaire
        </p>
      </div>
    </section>
  );
}
