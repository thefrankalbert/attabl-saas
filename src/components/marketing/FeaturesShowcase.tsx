'use client';

import { motion } from 'framer-motion';
import { Banknote, BarChart3, CreditCard, Package, QrCode, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const vendreFeatures: Feature[] = [
  {
    icon: QrCode,
    title: 'Catalogue Digital',
    description:
      'QR code, commandes en ligne, vitrine digitale. Présentez vos produits et services avec style.',
  },
  {
    icon: CreditCard,
    title: 'Point de Vente',
    description:
      'POS tactile, multi-méthodes de paiement. Cash, carte, mobile money — tout en un écran.',
  },
  {
    icon: Banknote,
    title: 'Paiements',
    description:
      '3 devises (XAF, EUR, USD), mobile money, réconciliation automatique. Encaissez sans friction.',
  },
];

const gererFeatures: Feature[] = [
  {
    icon: BarChart3,
    title: 'Analytics & IA',
    description:
      'Tableaux de bord, tendances, alertes proactives. Des insights, pas des données brutes.',
  },
  {
    icon: Package,
    title: 'Stock',
    description:
      'Inventaire temps réel, fournisseurs, réapprovisionnement automatique. Zéro rupture.',
  },
  {
    icon: Users,
    title: 'Équipe',
    description: 'Rôles, shifts, performance par employé. Gérez votre équipe, pas des tableurs.',
  },
];

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const Icon = feature.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      viewport={{ once: true }}
      className="bg-white p-6 rounded-xl border border-neutral-200 hover:scale-[1.02] hover:shadow-lg transition-all duration-200"
    >
      <div className="w-10 h-10 rounded-lg bg-[#CCFF00]/10 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-[#CCFF00]" />
      </div>
      <h3 className="text-lg font-semibold text-neutral-900 mb-2">{feature.title}</h3>
      <p className="text-sm text-neutral-600 leading-relaxed">{feature.description}</p>
    </motion.div>
  );
}

export default function FeaturesShowcase() {
  return (
    <section className="bg-neutral-50 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 text-center mb-4">
          Un écosystème complet, pas juste un outil
        </h2>
        <p className="text-lg text-neutral-500 text-center mb-16">
          Tout ce dont vous avez besoin pour vendre et gérer votre activité.
        </p>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#7C3AED] mb-6">
            VENDRE
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {vendreFeatures.map((feature, idx) => (
              <FeatureCard key={feature.title} feature={feature} index={idx} />
            ))}
          </div>
        </div>

        <div className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#7C3AED] mb-6">
            GÉRER
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {gererFeatures.map((feature, idx) => (
              <FeatureCard key={feature.title} feature={feature} index={idx} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
