import { Banknote, BarChart3, CreditCard, Package, QrCode, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const features: Feature[] = [
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

export default function FeaturesShowcase() {
  return (
    <section className="bg-neutral-50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-4 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 sm:text-4xl">
          Un ecosysteme complet
        </h2>
        <p className="mb-16 text-center text-base text-neutral-500">
          Tout pour vendre et gerer votre activite.
        </p>

        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-xl border border-neutral-200 bg-white p-6 transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100">
                  <Icon className="h-5 w-5 text-neutral-700" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-neutral-900">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-neutral-600">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
