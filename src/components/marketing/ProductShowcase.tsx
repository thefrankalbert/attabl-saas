'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const products = [
  {
    title: 'Dashboard en temps réel',
    description: 'Suivez vos ventes, commandes et performances en direct',
    category: 'ANALYTICS',
  },
  {
    title: 'Menu Digital QR Code',
    description: 'Menu bilingue avec photos et modificateurs personnalisables',
    category: 'MENU',
  },
  {
    title: 'Cuisine connectée (KDS)',
    description: 'Kitchen Display System pour optimiser votre production',
    category: 'KITCHEN',
  },
  {
    title: 'Point de vente (POS)',
    description: 'Encaissement rapide avec gestion multi-devises',
    category: 'POINT OF SALE',
  },
];

export default function ProductShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);

  const next = () => setActiveIndex((prev) => (prev + 1) % products.length);
  const prev = () => setActiveIndex((prev) => (prev - 1 + products.length) % products.length);

  return (
    <section className="relative bg-white py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          {/* Left: Product preview */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-neutral-100">
            <div className="flex h-full items-center justify-center">
              <p className="text-6xl font-bold text-neutral-300">
                {products[activeIndex].category}
              </p>
            </div>
          </div>

          {/* Right: Product info & navigation */}
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
              {products[activeIndex].category}
            </p>
            <h2 className="mt-4 text-5xl font-semibold leading-tight text-neutral-900">
              {products[activeIndex].title}
            </h2>
            <p className="mt-6 text-xl text-neutral-600">{products[activeIndex].description}</p>

            <div className="mt-8 flex items-center gap-4">
              <Link
                href="/features"
                className="text-base font-semibold text-primary underline decoration-2 underline-offset-4 transition-colors hover:text-primary-dark"
              >
                En savoir plus
              </Link>
            </div>

            {/* Navigation */}
            <div className="mt-12 flex items-center gap-4">
              <button
                type="button"
                onClick={prev}
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-neutral-900 text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={next}
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-neutral-900 text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              <span className="ml-4 text-sm text-neutral-600">
                {activeIndex + 1} / {products.length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
