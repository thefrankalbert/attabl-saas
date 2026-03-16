'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { UtensilsCrossed, Store, Scissors, Hotel } from 'lucide-react';

type Segment = 'restaurant' | 'boutique' | 'salon' | 'hotel';

const segments: { key: Segment; label: string; icon: React.ElementType }[] = [
  { key: 'restaurant', label: 'Restaurant', icon: UtensilsCrossed },
  { key: 'boutique', label: 'Boutique', icon: Store },
  { key: 'salon', label: 'Salon', icon: Scissors },
  { key: 'hotel', label: 'Hôtel', icon: Hotel },
];

const dashboardGradients: Record<Segment, string> = {
  restaurant: 'from-amber-500/20 to-orange-500/20',
  boutique: 'from-purple-500/20 to-pink-500/20',
  salon: 'from-rose-500/20 to-fuchsia-500/20',
  hotel: 'from-blue-500/20 to-cyan-500/20',
};

const stats = [
  { value: '+2 400', label: 'commerces actifs' },
  { value: '12', label: 'pays' },
  { value: '3', label: 'devises' },
  { value: '100%', label: 'cloud' },
];

export default function VideoHero() {
  const [activeSegment, setActiveSegment] = useState<Segment>('restaurant');

  return (
    <section className="relative min-h-screen w-full bg-[#1A1A2E]">
      {/* Hero grid */}
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-24 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:pt-32">
        {/* Left column — text */}
        <div className="text-center lg:text-left">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl"
          >
            <span className="text-[#CCFF00]">Lancez.</span>{' '}
            <span className="text-[#CCFF00]">Gérez.</span>{' '}
            <span className="text-[#CCFF00]">Grandissez.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mx-auto mt-6 max-w-xl text-lg text-white/70 lg:mx-0"
          >
            La plateforme commerce tout-en-un qui accompagne les entrepreneurs africains de
            l&apos;idée au succès.
          </motion.p>

          {/* Segment pills */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mt-8 flex flex-wrap justify-center gap-2 lg:justify-start"
          >
            {segments.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveSegment(key)}
                className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm transition-all ${
                  activeSegment === key
                    ? 'bg-[#CCFF00] font-semibold text-[#1A1A2E]'
                    : 'border border-white/20 text-white/70 hover:border-white/40'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="mt-10 flex justify-center lg:justify-start"
          >
            <Link
              href="/signup"
              className="rounded-full bg-[#CCFF00] px-8 py-4 font-bold text-[#1A1A2E] transition-transform hover:scale-105"
            >
              Démarrer gratuitement
            </Link>
          </motion.div>
        </div>

        {/* Right column — dashboard placeholder */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="aspect-video overflow-hidden rounded-2xl"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSegment}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${dashboardGradients[activeSegment]}`}
            >
              <p className="text-lg font-medium text-white/60">
                {segments.find((s) => s.key === activeSegment)?.label} Dashboard Preview
              </p>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Stats banner */}
      <div className="bg-white/5">
        <div className="mx-auto grid max-w-7xl grid-cols-2 sm:grid-cols-4">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={`px-6 py-8 text-center ${
                i < stats.length - 1 ? 'border-r border-white/10' : ''
              }`}
            >
              <p className="text-2xl font-bold text-white sm:text-3xl">{stat.value}</p>
              <p className="mt-1 text-xs text-white/50 sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
