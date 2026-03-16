'use client';

import { BlurFade } from '@/components/ui/blur-fade';
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
      'QR code, commandes en ligne, vitrine digitale. Presentez vos produits et services avec style.',
  },
  {
    icon: CreditCard,
    title: 'Point de Vente',
    description:
      'POS tactile, multi-methodes de paiement. Cash, carte, mobile money -- tout en un ecran.',
  },
  {
    icon: Banknote,
    title: 'Paiements',
    description:
      '3 devises (XAF, EUR, USD), mobile money, reconciliation automatique. Encaissez sans friction.',
  },
];

const gererFeatures: Feature[] = [
  {
    icon: BarChart3,
    title: 'Analytics & IA',
    description:
      'Tableaux de bord, tendances, alertes proactives. Des insights, pas des donnees brutes.',
  },
  {
    icon: Package,
    title: 'Stock',
    description:
      'Inventaire temps reel, fournisseurs, reapprovisionnement automatique. Zero rupture.',
  },
  {
    icon: Users,
    title: 'Equipe',
    description: 'Roles, shifts, performance par employe. Gerez votre equipe, pas des tableurs.',
  },
];

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const Icon = feature.icon;

  return (
    <BlurFade delay={index * 0.1} inView>
      <div className="rounded-xl border border-app-border bg-app-card p-5 transition-colors hover:border-app-border-hover">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-muted">
          <Icon className="h-5 w-5 text-accent" />
        </div>
        <h3 className="mb-1.5 text-base font-semibold text-app-text">{feature.title}</h3>
        <p className="text-sm leading-relaxed text-app-text-secondary">{feature.description}</p>
      </div>
    </BlurFade>
  );
}

function RowLabel({ label }: { label: string }) {
  return (
    <div className="mb-6 flex items-center gap-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">{label}</p>
      <div className="h-px flex-1 bg-app-border" />
    </div>
  );
}

export default function FeaturesShowcase() {
  return (
    <section className="bg-app-bg py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <BlurFade delay={0} inView>
          <h2 className="mb-4 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-app-text sm:text-4xl">
            Un ecosysteme complet, pas juste un outil
          </h2>
          <p className="mb-10 text-center text-base text-app-text-secondary sm:mb-16">
            Tout ce dont vous avez besoin pour vendre et gerer votre activite.
          </p>
        </BlurFade>

        <div>
          <RowLabel label="VENDRE" />
          <div className="grid gap-6 md:grid-cols-3">
            {vendreFeatures.map((feature, idx) => (
              <FeatureCard key={feature.title} feature={feature} index={idx} />
            ))}
          </div>
        </div>

        <div className="mt-12">
          <RowLabel label="GÉRER" />
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
