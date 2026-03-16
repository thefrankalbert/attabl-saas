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
    accentColor: '#4ade80',
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
    accentColor: '#a78bfa',
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
    accentColor: '#60a5fa',
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
    accentColor: '#f472b6',
    uiRows: ['Tresses africaines', 'Manucure gel', 'Massage detente'],
    uiPrices: ['15 000', '8 000', '12 000'],
    uiStatus: ['13h00', '14h30', '16h00'],
  },
];

function FakeAppUI({ tab }: { tab: (typeof tabs)[0] }) {
  return (
    <div className="rounded-xl border border-app-border bg-app-card p-4 sm:p-6">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between sm:mb-6">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tab.accentColor }} />
          <span className="text-xs font-medium text-app-text-muted sm:text-sm">{tab.label}</span>
        </div>
        <div className="flex gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-app-text-muted/40" />
          <div className="h-1.5 w-1.5 rounded-full bg-app-text-muted/40" />
          <div className="h-1.5 w-1.5 rounded-full bg-app-text-muted/40" />
        </div>
      </div>

      {/* Table header */}
      <div className="mb-2 grid grid-cols-3 border-b border-app-border pb-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-app-text-muted sm:text-xs">
          Nom
        </span>
        <span className="text-center text-[10px] font-medium uppercase tracking-wider text-app-text-muted sm:text-xs">
          Prix FCFA
        </span>
        <span className="text-right text-[10px] font-medium uppercase tracking-wider text-app-text-muted sm:text-xs">
          Statut
        </span>
      </div>

      {/* Table rows */}
      {tab.uiRows.map((row, i) => (
        <div
          key={row}
          className="grid grid-cols-3 items-center border-b border-app-border/50 py-2.5 sm:py-3"
        >
          <div className="flex items-center gap-2">
            <div
              className="h-1.5 w-1.5 rounded-full opacity-60"
              style={{ backgroundColor: tab.accentColor }}
            />
            <span className="truncate text-xs text-app-text-secondary sm:text-sm">{row}</span>
          </div>
          <span className="text-center text-xs tabular-nums text-app-text-muted sm:text-sm">
            {tab.uiPrices[i]}
          </span>
          <span
            className="text-right text-[10px] font-medium sm:text-xs"
            style={{ color: tab.accentColor }}
          >
            {tab.uiStatus[i]}
          </span>
        </div>
      ))}

      {/* Mini chart bar */}
      <div className="mt-4 flex items-end gap-1 sm:mt-6">
        {[40, 65, 45, 80, 55, 70, 90, 60, 75, 50, 85, 68].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t"
            style={{
              height: `${h * 0.4}px`,
              backgroundColor: i === 6 ? tab.accentColor : 'rgba(255,255,255,0.08)',
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        <span className="text-[9px] text-app-text-muted/50 sm:text-[10px]">Jan</span>
        <span className="text-[9px] text-app-text-muted/50 sm:text-[10px]">Dec</span>
      </div>
    </div>
  );
}

export default function SegmentsSection() {
  const [activeTab, setActiveTab] = useState('food');

  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <section className="bg-app-elevated/50 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <h2 className="mb-4 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-app-text sm:text-4xl">
          Quel que soit votre commerce, ATTABL parle votre langue
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-base text-app-text-secondary sm:mb-12">
          Une plateforme unique qui s&apos;adapte a votre secteur d&apos;activite.
        </p>

        {/* Pill tab bar */}
        <div className="mb-12 flex justify-center">
          <div
            className="inline-flex overflow-x-auto rounded-xl bg-app-bg p-1"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[44px] cursor-pointer whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-accent text-accent-text shadow-sm'
                    : 'text-app-text-muted hover:text-app-text-secondary'
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
            className="mt-10 grid gap-6 lg:grid-cols-5 lg:gap-10"
          >
            {/* Left -- Fake app UI */}
            <div className="lg:col-span-3">
              <FakeAppUI tab={currentTab} />
            </div>

            {/* Right -- Details */}
            <div className="flex flex-col justify-center lg:col-span-2">
              {/* Big stat */}
              <div className="mb-6">
                <span className="font-[family-name:var(--font-sora)] text-4xl font-bold text-accent sm:text-5xl">
                  {currentTab.stat}
                </span>
                <p className="mt-1 text-sm italic text-app-text-secondary">
                  {currentTab.statLabel}
                </p>
              </div>

              <p className="mb-4 text-sm text-app-text-secondary">
                <span className="font-medium text-app-text">Sous-segments : </span>
                {currentTab.subSegments}
              </p>

              <ul className="space-y-3">
                {currentTab.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 shrink-0 text-accent" />
                    <span className="text-sm text-app-text-secondary">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={currentTab.cta.href}
                className="mt-8 inline-flex min-h-[44px] w-fit items-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-hover"
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
