'use client';

import { motion } from 'framer-motion';
import { Banknote, BarChart3, CreditCard, Package, QrCode, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  iconBg: string;
  iconColor: string;
  accentBar: string;
}

const vendreFeatures: Feature[] = [
  {
    icon: QrCode,
    title: 'Catalogue Digital',
    description:
      'QR code, commandes en ligne, vitrine digitale. Presentez vos produits et services avec style.',
    iconBg: 'bg-[#CCFF00]/10',
    iconColor: 'text-[#CCFF00]',
    accentBar: 'bg-[#CCFF00]',
  },
  {
    icon: CreditCard,
    title: 'Point de Vente',
    description:
      'POS tactile, multi-methodes de paiement. Cash, carte, mobile money -- tout en un ecran.',
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-500',
    accentBar: 'bg-purple-500',
  },
  {
    icon: Banknote,
    title: 'Paiements',
    description:
      '3 devises (XAF, EUR, USD), mobile money, reconciliation automatique. Encaissez sans friction.',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-500',
    accentBar: 'bg-amber-500',
  },
];

const gererFeatures: Feature[] = [
  {
    icon: BarChart3,
    title: 'Analytics & IA',
    description:
      'Tableaux de bord, tendances, alertes proactives. Des insights, pas des donnees brutes.',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-500',
    accentBar: 'bg-blue-500',
  },
  {
    icon: Package,
    title: 'Stock',
    description:
      'Inventaire temps reel, fournisseurs, reapprovisionnement automatique. Zero rupture.',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-500',
    accentBar: 'bg-emerald-500',
  },
  {
    icon: Users,
    title: 'Equipe',
    description: 'Roles, shifts, performance par employe. Gerez votre equipe, pas des tableurs.',
    iconBg: 'bg-rose-500/10',
    iconColor: 'text-rose-500',
    accentBar: 'bg-rose-500',
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
      className="rounded-xl border border-neutral-200 bg-white p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${feature.iconBg}`}
      >
        <Icon className={`h-6 w-6 ${feature.iconColor}`} />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-neutral-900">{feature.title}</h3>
      <p className="text-sm leading-relaxed text-neutral-600">{feature.description}</p>
      <div className={`mt-4 h-0.5 w-8 rounded-full ${feature.accentBar}`} />
    </motion.div>
  );
}

function RowLabel({ label }: { label: string }) {
  return (
    <div className="mb-6 flex items-center gap-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-neutral-900">{label}</p>
      <div className="h-px flex-1 bg-neutral-200" />
    </div>
  );
}

export default function FeaturesShowcase() {
  return (
    <section className="bg-[#FAFAF9] py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-4 text-center text-3xl font-bold text-neutral-900 font-[family-name:var(--font-sora)] sm:text-4xl">
          Un ecosysteme complet, pas juste un outil
        </h2>
        <p className="mb-16 text-center text-lg text-neutral-500">
          Tout ce dont vous avez besoin pour vendre et gerer votre activite.
        </p>

        <div>
          <RowLabel label="VENDRE" />
          <div className="grid gap-6 md:grid-cols-3">
            {vendreFeatures.map((feature, idx) => (
              <FeatureCard key={feature.title} feature={feature} index={idx} />
            ))}
          </div>
        </div>

        <div className="mt-12">
          <RowLabel label="GERER" />
          <div className="grid gap-6 md:grid-cols-3">
            {gererFeatures.map((feature, idx) => (
              <FeatureCard key={feature.title} feature={feature} index={idx} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
