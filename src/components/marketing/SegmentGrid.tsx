'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { UtensilsCrossed, Zap, Hotel, Coffee, Truck, CakeSlice } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Segment {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
}

const segments: Segment[] = [
  {
    icon: UtensilsCrossed,
    title: 'Restaurants',
    description: 'Full-service & gastronomique',
    href: '/restaurants',
  },
  {
    icon: Zap,
    title: 'Quick-Service',
    description: 'Rapide, efficace, sans friction',
    href: '/quick-service',
  },
  {
    icon: Hotel,
    title: 'Hôtels',
    description: 'Room service & multi-points de vente',
    href: '/hotels',
  },
  {
    icon: Coffee,
    title: 'Bars & Cafés',
    description: 'Des commandes fluides, même en rush',
    href: '/bars-cafes',
  },
  {
    icon: Truck,
    title: 'Food Trucks',
    description: 'Votre menu digital qui vous suit',
    href: '/food-trucks',
  },
  {
    icon: CakeSlice,
    title: 'Boulangeries',
    description: 'Vos recettes pilotent vos stocks',
    href: '/boulangeries',
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function SegmentGrid() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-center font-[family-name:var(--font-sora)] text-3xl sm:text-4xl font-bold text-neutral-900 mb-4">
          Conçu pour votre activité
        </h2>
        <p className="text-center text-neutral-700 text-lg mb-12 max-w-2xl mx-auto">
          Quel que soit votre établissement, Attabl s&apos;adapte à votre réalité.
        </p>

        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={containerVariants}
        >
          {segments.map((segment) => {
            const Icon = segment.icon;
            return (
              <motion.div key={segment.href} variants={cardVariants}>
                <Link
                  href={segment.href}
                  className="rounded-xl border border-neutral-100 p-6 hover:border-brand-green hover:shadow-lg transition-all duration-300 group block"
                >
                  <div className="w-12 h-12 rounded-lg bg-brand-green-light flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-brand-green" />
                  </div>
                  <h3 className="font-[family-name:var(--font-sora)] font-semibold text-lg text-neutral-900 mb-2 group-hover:text-brand-green transition-colors">
                    {segment.title}
                  </h3>
                  <p className="text-neutral-700 text-sm">{segment.description}</p>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
