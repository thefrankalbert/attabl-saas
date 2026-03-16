import Link from 'next/link';
import { UtensilsCrossed, Hotel, Zap, Wine, Flame } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SegmentCard {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
}

const segmentCards: SegmentCard[] = [
  {
    icon: UtensilsCrossed,
    title: 'Restaurants',
    description: 'Service en salle, menu gastronomique, fiches techniques',
    href: '/restaurants',
  },
  {
    icon: Hotel,
    title: 'Hôtels',
    description: 'Room service, multi-venues, gestion par étage',
    href: '/hotels',
  },
  {
    icon: Zap,
    title: 'Quick-Service',
    description: 'Comptoir, drive, commandes express',
    href: '/quick-service',
  },
  {
    icon: Wine,
    title: 'Bars & Cafés',
    description: 'Carte cocktails, terrasse, service au comptoir',
    href: '/bars-cafes',
  },
  {
    icon: Flame,
    title: 'Fast-Food',
    description: 'Écran cuisine, gestion des files, bornes',
    href: '/fast-food',
  },
];

export default function SegmentsSection() {
  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <h2 className="mb-4 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 sm:text-4xl">
          Un outil. Votre métier.
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-base text-neutral-500">
          Du comptoir au palace, Attabl parle votre langue.
        </p>

        {/* 5-card grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {segmentCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="rounded-xl border border-neutral-200 bg-white p-6 transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100">
                  <Icon className="h-5 w-5 text-neutral-700" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-neutral-900">{card.title}</h3>
                <p className="mb-4 text-sm leading-relaxed text-neutral-600">{card.description}</p>
                <Link
                  href={card.href}
                  className="text-sm font-medium text-neutral-900 hover:text-neutral-600 transition-colors"
                >
                  En savoir plus &rarr;
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
