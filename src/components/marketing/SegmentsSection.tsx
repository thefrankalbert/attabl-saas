'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

const segments = [
  {
    title: 'Restaurants',
    description: 'Gastronomie et service à table',
    href: '/restaurants',
  },
  {
    title: 'Hôtels',
    description: 'Room service et multi-venues',
    href: '/hotels',
  },
  {
    title: 'Quick-Service',
    description: 'Rapidité et efficacité',
    href: '/quick-service',
  },
  {
    title: 'Bars & Cafés',
    description: 'Comptoir et terrasse',
    href: '/bars-cafes',
  },
  {
    title: 'Food Trucks',
    description: 'Mobile et connecté',
    href: '/food-trucks',
  },
  {
    title: 'Boulangeries',
    description: 'Artisanat et précision',
    href: '/boulangeries',
  },
];

export default function SegmentsSection() {
  return (
    <section className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-4">
            Conçu pour votre activité
          </h2>
          <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
            Que vous gériez un food truck ou un palace, Attabl s&apos;adapte à vos besoins.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {segments.map((segment, idx) => (
            <motion.div
              key={segment.href}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              viewport={{ once: true }}
            >
              <Link
                href={segment.href}
                className="group block bg-white border border-neutral-200 rounded-2xl p-8 hover:border-neutral-900 hover:shadow-lg transition-all"
              >
                <h3 className="text-xl font-semibold text-neutral-900 mb-2">{segment.title}</h3>
                <p className="text-neutral-600 text-sm">{segment.description}</p>
                <div className="mt-4 inline-flex items-center text-sm font-medium text-neutral-900 group-hover:gap-2 transition-all">
                  En savoir plus
                  <svg
                    className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
