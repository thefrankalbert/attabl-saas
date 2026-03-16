'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';

const tabs = [
  {
    id: 'food',
    label: 'Restauration',
    subSegments: 'Restaurants, cafes, bars, food trucks, boulangeries',
    stat: '67%',
    statLabel: 'de nos utilisateurs sont dans la restauration',
    features: [
      'Menu QR code',
      'Kitchen Display (KDS)',
      'Gestion de tables',
      'Commandes en salle et a emporter',
    ],
    cta: { label: 'Decouvrir pour la restauration', href: '/restaurants' },
    accent: 'bg-amber-400',
    accentText: 'text-amber-400',
    uiRows: ['Poulet Braise', 'Ndole Special', 'Jus de Gingembre'],
    uiPrices: ['4 500', '3 800', '1 200'],
    uiStatus: ['En cours', 'Pret', 'Nouveau'],
  },
  {
    id: 'retail',
    label: 'Commerce & Retail',
    subSegments: 'Boutiques, marches, pharmacies, epiceries',
    stat: '3x',
    statLabel: 'plus rapide que la gestion manuelle',
    features: [
      'Catalogue digital',
      'Point de vente (POS)',
      'Gestion de stock',
      'Suivi fournisseurs',
    ],
    cta: { label: 'Decouvrir pour le commerce', href: '/retail' },
    accent: 'bg-purple-400',
    accentText: 'text-purple-400',
    uiRows: ['T-Shirt Wax', 'Sac en cuir', 'Bracelet perles'],
    uiPrices: ['12 000', '25 000', '3 500'],
    uiStatus: ['En stock', 'Bas', 'En stock'],
  },
  {
    id: 'hospitality',
    label: 'Hotellerie',
    subSegments: 'Hotels, resorts, auberges',
    stat: '12',
    statLabel: 'pays couverts en Afrique',
    features: [
      'Room service digital',
      'Multi-points de vente',
      'Gestion par etage',
      'Multi-devises',
    ],
    cta: { label: "Decouvrir pour l'hotellerie", href: '/hotels' },
    accent: 'bg-blue-400',
    accentText: 'text-blue-400',
    uiRows: ['Chambre 204', 'Suite Royale', 'Pool Bar'],
    uiPrices: ['45 000', '120 000', '8 500'],
    uiStatus: ['Actif', 'Occupe', 'Ouvert'],
  },
  {
    id: 'services',
    label: 'Services',
    subSegments: 'Salons de coiffure, instituts de beaute, coworking',
    stat: '24/7',
    statLabel: 'reservations et encaissement simplifies',
    features: ['Catalogue de prestations', 'Planning equipe', 'Encaissement', 'Programme fidelite'],
    cta: { label: 'Decouvrir pour les services', href: '/salons' },
    accent: 'bg-rose-400',
    accentText: 'text-rose-400',
    uiRows: ['Tresses africaines', 'Manucure gel', 'Massage detente'],
    uiPrices: ['15 000', '8 000', '12 000'],
    uiStatus: ['13h00', '14h30', '16h00'],
  },
];

function FakeAppUI({ tab }: { tab: (typeof tabs)[0] }) {
  return (
    <div className="rounded-2xl bg-[#0A0A0F] p-4 sm:p-6">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between sm:mb-6">
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${tab.accent}`} />
          <span className="text-xs font-medium text-white/60 sm:text-sm">{tab.label}</span>
        </div>
        <div className="flex gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
          <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
          <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
        </div>
      </div>

      {/* Table header */}
      <div className="mb-2 grid grid-cols-3 border-b border-white/[0.06] pb-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-white/30 sm:text-xs">
          Nom
        </span>
        <span className="text-center text-[10px] font-medium uppercase tracking-wider text-white/30 sm:text-xs">
          Prix FCFA
        </span>
        <span className="text-right text-[10px] font-medium uppercase tracking-wider text-white/30 sm:text-xs">
          Statut
        </span>
      </div>

      {/* Table rows */}
      {tab.uiRows.map((row, i) => (
        <div
          key={row}
          className="grid grid-cols-3 items-center border-b border-white/[0.04] py-2.5 sm:py-3"
        >
          <div className="flex items-center gap-2">
            <div className={`h-1.5 w-1.5 rounded-full ${tab.accent} opacity-60`} />
            <span className="truncate text-xs text-white/70 sm:text-sm">{row}</span>
          </div>
          <span className="text-center text-xs tabular-nums text-white/50 sm:text-sm">
            {tab.uiPrices[i]}
          </span>
          <span className={`text-right text-[10px] font-medium sm:text-xs ${tab.accentText}`}>
            {tab.uiStatus[i]}
          </span>
        </div>
      ))}

      {/* Mini chart bar */}
      <div className="mt-4 flex items-end gap-1 sm:mt-6">
        {[40, 65, 45, 80, 55, 70, 90, 60, 75, 50, 85, 68].map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t ${i === 6 ? tab.accent : 'bg-white/[0.08]'}`}
            style={{ height: `${h * 0.4}px` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        <span className="text-[9px] text-white/20 sm:text-[10px]">Jan</span>
        <span className="text-[9px] text-white/20 sm:text-[10px]">Dec</span>
      </div>
    </div>
  );
}

export default function SegmentsSection() {
  const [activeTab, setActiveTab] = useState('food');

  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <section className="bg-white py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <h2 className="mb-4 text-center text-3xl font-bold text-neutral-900 font-[family-name:var(--font-sora)] sm:text-4xl">
          Quel que soit votre commerce, ATTABL parle votre langue
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-base text-neutral-500 sm:mb-12 sm:text-lg">
          Une plateforme unique qui s&apos;adapte a votre secteur d&apos;activite.
        </p>

        {/* Pill tab bar */}
        <div className="mb-12 flex justify-center">
          <div
            className="inline-flex overflow-x-auto rounded-full bg-neutral-100 p-1"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[44px] cursor-pointer whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#0A0A0F] text-white shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="grid gap-8 lg:grid-cols-5 lg:gap-12"
          >
            {/* Left -- Fake app UI */}
            <div className="lg:col-span-3">
              <FakeAppUI tab={currentTab} />
            </div>

            {/* Right -- Details */}
            <div className="flex flex-col justify-center lg:col-span-2">
              {/* Big stat */}
              <div className="mb-6">
                <span className="font-[family-name:var(--font-sora)] text-4xl font-bold text-[#CCFF00] sm:text-5xl">
                  {currentTab.stat}
                </span>
                <p className="mt-1 text-sm text-neutral-500">{currentTab.statLabel}</p>
              </div>

              <p className="mb-4 text-sm text-neutral-500">
                <span className="font-medium text-neutral-700">Sous-segments : </span>
                {currentTab.subSegments}
              </p>

              <ul className="space-y-3">
                {currentTab.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#CCFF00]/15">
                      <Check className="h-3 w-3 text-[#0A0A0F]" />
                    </div>
                    <span className="text-sm text-neutral-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={currentTab.cta.href}
                className="mt-8 inline-flex min-h-[44px] w-fit items-center rounded-full bg-[#0A0A0F] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[#0A0A0F]/90 hover:shadow-lg"
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
