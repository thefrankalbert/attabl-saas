'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UtensilsCrossed, Store, Scissors, Hotel } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Segment = 'restaurant' | 'boutique' | 'salon' | 'hotel';

const segments: { key: Segment; label: string; icon: React.ElementType }[] = [
  { key: 'restaurant', label: 'Restaurant', icon: UtensilsCrossed },
  { key: 'boutique', label: 'Boutique', icon: Store },
  { key: 'salon', label: 'Salon', icon: Scissors },
  { key: 'hotel', label: 'Hôtel', icon: Hotel },
];

const dashboardKPIs: Record<Segment, { label: string; value: string }[]> = {
  restaurant: [
    { label: 'Revenu', value: '2 450 000 F' },
    { label: 'Commandes', value: '152' },
    { label: 'Clients', value: '1 243' },
    { label: 'Panier moy.', value: '13 100 F' },
  ],
  boutique: [
    { label: 'Revenu', value: '1 870 000 F' },
    { label: 'Ventes', value: '89' },
    { label: 'Clients', value: '2 891' },
    { label: 'Panier moy.', value: '5 990 F' },
  ],
  salon: [
    { label: 'Revenu', value: '980 000 F' },
    { label: 'RDV', value: '94' },
    { label: 'Clients', value: '421' },
    { label: 'Panier moy.', value: '10 400 F' },
  ],
  hotel: [
    { label: 'Revenu', value: '5 120 000 F' },
    { label: 'Réservations', value: '63' },
    { label: 'Clients', value: '189' },
    { label: 'Panier moy.', value: '81 300 F' },
  ],
};

const dashboardBars: Record<Segment, number[]> = {
  restaurant: [60, 45, 80, 55, 95, 70, 50],
  boutique: [70, 88, 55, 92, 60, 75, 40],
  salon: [45, 78, 65, 82, 50, 60, 70],
  hotel: [92, 55, 78, 40, 88, 65, 72],
};

const tableRows: Record<Segment, { name: string; value: string }[]> = {
  restaurant: [
    { name: 'Poulet braisé', value: '24 500 F' },
    { name: 'Ndolé complet', value: '18 200 F' },
    { name: 'Poisson grillé', value: '31 800 F' },
  ],
  boutique: [
    { name: 'Robe wax', value: '15 000 F' },
    { name: 'Sac en cuir', value: '22 500 F' },
    { name: 'Bijoux argent', value: '8 900 F' },
  ],
  salon: [
    { name: 'Coupe homme', value: '3 500 F' },
    { name: 'Tresses', value: '12 000 F' },
    { name: 'Soin cheveux', value: '8 000 F' },
  ],
  hotel: [
    { name: 'Suite junior', value: '85 000 F' },
    { name: 'Chambre double', value: '45 000 F' },
    { name: 'Petit-déjeuner', value: '12 500 F' },
  ],
};

const barDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function VideoHero() {
  const [activeSegment, setActiveSegment] = useState<Segment>('restaurant');
  const kpis = dashboardKPIs[activeSegment];
  const bars = dashboardBars[activeSegment];
  const rows = tableRows[activeSegment];

  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Centered text */}
        <div className="text-center">
          <h1 className="mx-auto max-w-4xl font-[family-name:var(--font-sora)] text-5xl font-bold tracking-tight text-neutral-900 sm:text-6xl lg:text-7xl">
            Tout ce qu&apos;il faut pour piloter votre commerce
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-neutral-500">
            Menu digital, stock, caisse, analytics — une plateforme unique pour les entrepreneurs
            africains.
          </p>

          {/* CTA row */}
          <div className="mt-10 flex justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-lg bg-neutral-900 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-neutral-800"
            >
              Démarrer gratuitement
            </Link>
            <Link
              href="/contact"
              className="rounded-lg border border-neutral-300 px-8 py-4 text-base font-semibold text-neutral-900 transition-colors hover:bg-neutral-50"
            >
              Contacter l&apos;équipe
            </Link>
          </div>

          {/* Segment pills */}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {segments.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveSegment(key)}
                className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  activeSegment === key
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Dashboard mockup */}
        <div className="mx-auto mt-16 max-w-5xl">
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl shadow-neutral-900/5">
            {/* Top bar */}
            <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-6 py-3">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400" />
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                </div>
                <span className="text-sm font-medium text-neutral-600">Dashboard</span>
              </div>
              <div className="h-7 w-7 rounded-full bg-neutral-300" />
            </div>

            {/* Dashboard content with crossfade */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSegment}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* KPI row */}
                <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
                  {kpis.map((kpi) => (
                    <div key={kpi.label} className="rounded-xl bg-neutral-50 p-4">
                      <p className="text-2xl font-bold tabular-nums text-neutral-900">
                        {kpi.value}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">{kpi.label}</p>
                    </div>
                  ))}
                </div>

                {/* Chart area */}
                <div className="px-6 pb-6">
                  <div className="rounded-xl bg-neutral-50 p-4">
                    <p className="mb-3 text-xs font-medium text-neutral-500">
                      Ventes cette semaine
                    </p>
                    <div className="flex h-24 items-end gap-2">
                      {bars.map((height, i) => (
                        <div key={i} className="flex flex-1 flex-col items-center gap-1">
                          <div
                            className={`w-full rounded-sm ${i === 4 ? 'bg-neutral-900' : 'bg-neutral-200'}`}
                            style={{ height: `${height}%` }}
                          />
                          <span className="text-[10px] text-neutral-400">{barDays[i]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Mock table */}
                <div className="px-6 pb-6">
                  {rows.map((row, i) => (
                    <div
                      key={row.name}
                      className={`flex items-center justify-between px-0 py-3 ${
                        i < rows.length - 1 ? 'border-b border-neutral-100' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-neutral-900" />
                        <span className="text-sm text-neutral-700">{row.name}</span>
                      </div>
                      <span className="text-sm font-medium tabular-nums text-neutral-900">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
