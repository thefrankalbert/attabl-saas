'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, ShoppingBag, Beaker, BarChart3, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
  features: string[];
}

const tabs: Tab[] = [
  {
    id: 'menu',
    label: 'Menu Digital',
    icon: BookOpen,
    features: [
      'Menus et sous-menus hiérarchiques',
      'Bilingue français / anglais',
      'Options et suppléments payants',
      'Suggestions et accords',
    ],
  },
  {
    id: 'orders',
    label: 'Commandes',
    icon: ShoppingBag,
    features: [
      '4 modes : dine-in, takeaway, livraison, room service',
      'Suivi en cuisine par plat (KDS)',
      'Gestion par course (entrée, plat, dessert)',
      'Numérotation automatique fiable',
    ],
  },
  {
    id: 'stock',
    label: 'Stock & Recettes',
    icon: Beaker,
    features: [
      'Fiches techniques liées aux ingrédients',
      'Déstockage automatique par commande',
      'Alertes stock bas + désactivation auto',
      'Gestion fournisseurs',
    ],
  },
  {
    id: 'business',
    label: 'Business',
    icon: BarChart3,
    features: [
      'Coupons et promotions',
      'Taxes et frais de service automatiques',
      'Multi-devises (XAF, EUR, USD)',
      'Rapports revenus et best-sellers',
    ],
  },
];

const contentVariants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' as const },
  },
  exit: {
    opacity: 0,
    y: -12,
    transition: { duration: 0.2, ease: 'easeIn' as const },
  },
};

export default function FeatureTabs() {
  const [activeTab, setActiveTab] = useState(0);

  const currentTab = tabs[activeTab];

  return (
    <section className="py-20 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-center font-[family-name:var(--font-sora)] text-3xl sm:text-4xl font-bold text-neutral-900 mb-4">
          Tout ce qu&apos;il vous faut
        </h2>
        <p className="text-center text-neutral-700 text-lg mb-12 max-w-2xl mx-auto">
          Une plateforme complète pour chaque aspect de votre activité.
        </p>

        {/* Tab bar */}
        <div className="flex gap-2 justify-center mb-8 flex-wrap">
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = index === activeTab;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(index)}
                className={`px-4 sm:px-6 py-3 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                  isActive
                    ? 'bg-brand-green text-white shadow-sm'
                    : 'text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab.id}
            variants={contentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <ul className="space-y-1">
              {currentTab.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 py-3">
                  <span className="w-6 h-6 rounded-full bg-brand-green-light flex items-center justify-center shrink-0">
                    <Check className="h-3.5 w-3.5 text-brand-green" />
                  </span>
                  <span className="text-neutral-700 text-base">{feature}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
