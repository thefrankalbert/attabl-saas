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
    title: 'Menu QR Digital',
    description: 'Vos clients scannent et commandent. Bilingue, avec photos et modificateurs.',
  },
  {
    icon: CreditCard,
    title: 'Point de Vente',
    description: 'Encaissement tactile. Cash, carte, mobile money - tout en un écran.',
  },
  {
    icon: Banknote,
    title: 'Paiements',
    description: 'XAF, EUR, USD. Mobile money. Réconciliation automatique.',
  },
  {
    icon: BarChart3,
    title: 'Analytics & IA',
    description: 'Tendances, alertes, suggestions. Des insights, pas des tableurs.',
  },
  {
    icon: Package,
    title: 'Stock & Ingrédients',
    description: 'Inventaire temps réel. Chaque commande déduit automatiquement.',
  },
  {
    icon: Users,
    title: 'Équipe & Service',
    description: 'Rôles, shifts, performance. Gérez votre brigade, pas de la paperasse.',
  },
];

export default function FeaturesShowcase() {
  return (
    <section className="bg-neutral-50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-4 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 sm:text-4xl">
          Pas juste un outil. Un écosystème.
        </h2>
        <p className="mb-16 text-center text-base text-neutral-500">
          Tout pour vendre et gérer votre activité.
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
