'use client';

import Link from 'next/link';

const industries = [
  {
    title: 'Restaurants',
    subtitle: 'Gastronomie',
    href: '/restaurants',
  },
  {
    title: 'Hôtels',
    subtitle: 'Hôtellerie',
    href: '/hotels',
  },
  {
    title: 'Quick Service',
    subtitle: 'Service rapide',
    href: '/quick-service',
  },
  {
    title: 'Bars & Cafés',
    subtitle: 'Boissons',
    href: '/bars-cafes',
  },
];

export default function IndustrySection() {
  return (
    <section className="relative bg-black py-32 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
          CONÇU POUR TOUS LES SECTEURS
        </p>
        <h2 className="mt-4 text-5xl font-semibold leading-tight">Développez votre activité</h2>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {industries.map((industry, idx) => (
            <Link
              key={idx}
              href={industry.href}
              className="group rounded-2xl border border-white/10 bg-zinc-900 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[#CCFF00]/40"
            >
              <h3 className="text-2xl font-bold text-white">{industry.title}</h3>
              <p className="mt-2 text-sm text-neutral-400">{industry.subtitle}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
