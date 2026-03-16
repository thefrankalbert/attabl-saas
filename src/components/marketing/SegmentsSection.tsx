'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';

const tabs = [
  {
    id: 'food',
    label: 'Restauration',
    subSegments: 'Restaurants, cafés, bars, food trucks, boulangeries',
    stat: '67% de nos utilisateurs sont dans la restauration',
    features: [
      'Menu QR code',
      'Kitchen Display (KDS)',
      'Gestion de tables',
      'Commandes en salle et à emporter',
    ],
    cta: { label: 'Découvrir pour la restauration', href: '/restaurants' },
    gradient: 'from-amber-500/20 to-orange-500/20',
  },
  {
    id: 'retail',
    label: 'Commerce & Retail',
    subSegments: 'Boutiques, marchés, pharmacies, épiceries',
    stat: 'Gestion de stock intégrée, adaptée au commerce africain',
    features: [
      'Catalogue digital',
      'Point de vente (POS)',
      'Gestion de stock',
      'Suivi fournisseurs',
    ],
    cta: { label: 'Découvrir pour le commerce', href: '/retail' },
    gradient: 'from-purple-500/20 to-pink-500/20',
  },
  {
    id: 'hospitality',
    label: 'Hôtellerie',
    subSegments: 'Hôtels, resorts, auberges',
    stat: 'Multi-venue, multi-devise, multi-langue',
    features: [
      'Room service digital',
      'Multi-points de vente',
      'Gestion par étage',
      'Multi-devises',
    ],
    cta: { label: "Découvrir pour l'hôtellerie", href: '/hotels' },
    gradient: 'from-blue-500/20 to-cyan-500/20',
  },
  {
    id: 'services',
    label: 'Services',
    subSegments: 'Salons de coiffure, instituts de beauté, coworking',
    stat: 'Rendez-vous et encaissement simplifiés',
    features: ['Catalogue de prestations', 'Planning équipe', 'Encaissement', 'Programme fidélité'],
    cta: { label: 'Découvrir pour les services', href: '/salons' },
    gradient: 'from-rose-500/20 to-fuchsia-500/20',
  },
];

export default function SegmentsSection() {
  const [activeTab, setActiveTab] = useState('food');

  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <h2 className="mb-4 text-center text-3xl font-bold text-neutral-900 sm:text-4xl">
          Quel que soit votre commerce, ATTABL parle votre langue
        </h2>
        <p className="mb-12 text-center text-lg text-neutral-500">
          Une plateforme unique qui s&apos;adapte à votre secteur d&apos;activité.
        </p>

        {/* Tab bar */}
        <div className="flex overflow-x-auto border-b border-neutral-200 flex-nowrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`cursor-pointer whitespace-nowrap px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-[3px] border-[#CCFF00] font-bold text-neutral-900'
                  : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-12 grid gap-8 lg:grid-cols-5 lg:gap-12"
          >
            {/* Left — Screenshot placeholder */}
            <div className="lg:col-span-3">
              <div
                className={`flex aspect-video items-center justify-center rounded-2xl bg-gradient-to-br ${currentTab.gradient}`}
              >
                <span className="text-lg font-semibold text-neutral-700">{currentTab.label}</span>
              </div>
            </div>

            {/* Right — Details */}
            <div className="lg:col-span-2">
              <p className="mb-4 text-sm text-neutral-500">
                <span className="font-medium">Sous-segments : </span>
                {currentTab.subSegments}
              </p>

              <p className="mb-6 text-lg font-semibold italic text-neutral-800">
                &laquo;&nbsp;{currentTab.stat}&nbsp;&raquo;
              </p>

              <ul className="space-y-3">
                {currentTab.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-[#CCFF00]" />
                    <span className="text-sm text-neutral-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={currentTab.cta.href}
                className="mt-6 inline-flex items-center rounded-full border-2 border-neutral-900 px-6 py-3 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white"
              >
                {currentTab.cta.label}
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
