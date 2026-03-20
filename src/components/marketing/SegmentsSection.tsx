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
    description: 'Gérez votre salle, vos menus et votre cuisine depuis un seul écran.',
    href: '/restaurants',
  },
  {
    icon: Hotel,
    title: 'Hôtels',
    description: 'Room service, restaurant, bar piscine - tout unifié, multilingue.',
    href: '/hotels',
  },
  {
    icon: Zap,
    title: 'Quick-Service',
    description: 'Comptoir, drive, commandes express. Chaque seconde compte.',
    href: '/quick-service',
  },
  {
    icon: Wine,
    title: 'Bars & Cafés',
    description: 'Carte cocktails, service terrasse, suivi des boissons en temps réel.',
    href: '/bars-cafes',
  },
  {
    icon: Flame,
    title: 'Fast-Food',
    description: 'Écran cuisine, bornes, multi-sites. La vitesse sans le chaos.',
    href: '/fast-food',
  },
];

export default function SegmentsSection() {
  return (
    <section className="bg-white dark:bg-neutral-950 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <h2 className="mb-4 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 dark:text-white sm:text-4xl">
          Un outil. Votre métier.
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-base text-neutral-500 dark:text-neutral-400">
          Du comptoir au palace, Attabl parle votre langue.
        </p>

        {/* 5-card grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {segmentCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                  <Icon className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-neutral-900 dark:text-white">
                  {card.title}
                </h3>
                <p className="mb-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {card.description}
                </p>
                <Link
                  href={card.href}
                  className="text-sm font-medium text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
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
