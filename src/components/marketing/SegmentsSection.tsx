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
    features: [
      'Menu QR code avec commande en ligne',
      'Kitchen Display (KDS) temps reel',
      'Gestion de tables et salle',
      'Commandes en salle et a emporter',
    ],
    cta: { label: 'Decouvrir pour la restauration', href: '/restaurants' },
    uiTitle: 'Commandes du jour',
    uiRows: [
      { name: 'Poulet Braise', price: '4 500 FCFA', status: 'En cours' },
      { name: 'Ndole Special', price: '3 800 FCFA', status: 'Pret' },
      { name: 'Jus de Gingembre', price: '1 200 FCFA', status: 'Nouveau' },
      { name: 'Poisson Grille', price: '5 200 FCFA', status: 'En cours' },
    ],
    uiChart: [40, 65, 45, 80, 55, 70, 90, 60],
  },
  {
    id: 'retail',
    label: 'Commerce & Retail',
    subSegments: 'Boutiques, marches, pharmacies, epiceries',
    features: [
      'Catalogue digital avec photos',
      'Point de vente (POS) tactile',
      'Gestion de stock en temps reel',
      'Suivi fournisseurs et reapprovisionnement',
    ],
    cta: { label: 'Decouvrir pour le commerce', href: '/retail' },
    uiTitle: 'Inventaire',
    uiRows: [
      { name: 'T-Shirt Wax', price: '12 000 FCFA', status: 'En stock' },
      { name: 'Sac en cuir', price: '25 000 FCFA', status: 'Bas' },
      { name: 'Bracelet perles', price: '3 500 FCFA', status: 'En stock' },
      { name: 'Sandales cuir', price: '18 000 FCFA', status: 'En stock' },
    ],
    uiChart: [55, 70, 60, 45, 80, 65, 75, 50],
  },
  {
    id: 'hospitality',
    label: 'Hotellerie',
    subSegments: 'Hotels, resorts, auberges',
    features: [
      'Room service digital',
      'Multi-points de vente',
      'Gestion par etage et zone',
      'Multi-devises (XAF, EUR, USD)',
    ],
    cta: { label: "Decouvrir pour l'hotellerie", href: '/hotels' },
    uiTitle: 'Room Service',
    uiRows: [
      { name: 'Chambre 204', price: '45 000 FCFA', status: 'Actif' },
      { name: 'Suite Royale', price: '120 000 FCFA', status: 'Occupe' },
      { name: 'Pool Bar', price: '8 500 FCFA', status: 'Ouvert' },
      { name: 'Chambre 312', price: '55 000 FCFA', status: 'Actif' },
    ],
    uiChart: [70, 85, 60, 90, 75, 80, 65, 55],
  },
  {
    id: 'services',
    label: 'Services',
    subSegments: 'Salons de coiffure, instituts de beaute, coworking',
    features: [
      'Catalogue de prestations',
      'Planning equipe et reservations',
      'Encaissement multi-methodes',
      'Programme fidelite clients',
    ],
    cta: { label: 'Decouvrir pour les services', href: '/salons' },
    uiTitle: 'Rendez-vous',
    uiRows: [
      { name: 'Tresses africaines', price: '15 000 FCFA', status: '13h00' },
      { name: 'Manucure gel', price: '8 000 FCFA', status: '14h30' },
      { name: 'Massage detente', price: '12 000 FCFA', status: '16h00' },
      { name: 'Coupe homme', price: '3 000 FCFA', status: '17h00' },
    ],
    uiChart: [50, 60, 75, 85, 70, 55, 80, 65],
  },
];

function FakeAppUI({ tab }: { tab: (typeof tabs)[0] }) {
  const maxChart = Math.max(...tab.uiChart);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-1 shadow-lg">
      <div className="rounded-xl bg-white p-4 sm:p-6">
        {/* Top nav bar */}
        <div className="mb-5 flex items-center justify-between border-b border-neutral-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900">
              <span className="text-xs font-bold text-white">A</span>
            </div>
            <span className="text-sm font-semibold text-neutral-900">{tab.uiTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-xs text-neutral-500">En ligne</span>
          </div>
        </div>

        {/* List items */}
        <div className="space-y-0">
          {tab.uiRows.map((row, i) => (
            <div
              key={row.name}
              className={`flex items-center justify-between py-3 ${
                i < tab.uiRows.length - 1 ? 'border-b border-neutral-100' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100">
                  <span className="text-xs font-medium text-neutral-600">{row.name.charAt(0)}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">{row.name}</p>
                  <p className="text-xs text-neutral-500">{row.price}</p>
                </div>
              </div>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                {row.status}
              </span>
            </div>
          ))}
        </div>

        {/* Mini chart */}
        <div className="mt-5 rounded-lg bg-neutral-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-700">Activite</span>
            <span className="text-xs text-neutral-400">7 derniers jours</span>
          </div>
          <div className="flex items-end gap-1.5">
            {tab.uiChart.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t"
                style={{
                  height: `${(h / maxChart) * 48}px`,
                  backgroundColor: h === Math.max(...tab.uiChart) ? '#171717' : '#e5e5e5',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SegmentsSection() {
  const [activeTab, setActiveTab] = useState('food');

  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <h2 className="mb-4 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 sm:text-4xl">
          Quel que soit votre commerce, ATTABL s&apos;adapte
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-base text-neutral-500 sm:mb-12">
          Une plateforme unique qui s&apos;adapte a votre secteur d&apos;activite.
        </p>

        {/* Pill tab bar */}
        <div className="mb-12 flex justify-center">
          <div className="inline-flex rounded-full bg-neutral-100 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`cursor-pointer whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-neutral-900 shadow-sm'
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-12 grid items-center gap-12 lg:grid-cols-2"
          >
            {/* Left -- Fake app UI */}
            <div>
              <FakeAppUI tab={currentTab} />
            </div>

            {/* Right -- Details */}
            <div className="flex flex-col justify-center">
              <p className="mb-6 text-sm text-neutral-500">{currentTab.subSegments}</p>

              <ul className="space-y-3">
                {currentTab.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 shrink-0 text-green-600" />
                    <span className="text-sm text-neutral-600">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={currentTab.cta.href}
                className="mt-8 inline-flex w-fit items-center rounded-lg bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
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
