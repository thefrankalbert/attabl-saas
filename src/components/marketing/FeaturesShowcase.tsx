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
    title: 'Menu QR',
    description:
      "Vos clients scannent et commandent depuis leur table. Bilingue, avec photos. La carte papier, c'est fini.",
  },
  {
    icon: CreditCard,
    title: 'Point de Vente',
    description:
      'Encaissement tactile, rapide. Cash, carte, mobile money - un seul écran pour tout.',
  },
  {
    icon: Banknote,
    title: 'Paiements',
    description: 'XAF, EUR, USD. Mobile money intégré. Réconciliation automatique chaque soir.',
  },
  {
    icon: BarChart3,
    title: 'Analytics & IA',
    description: 'Vos ventes, vos tendances, vos alertes. Des réponses, pas des tableaux.',
  },
  {
    icon: Package,
    title: 'Stock & Ingrédients',
    description: 'Chaque plat vendu déduit les ingrédients. Alerte quand il faut recommander.',
  },
  {
    icon: Users,
    title: 'Équipe & Service',
    description: 'Rôles, shifts, performance. Vous gérez votre brigade, pas de la paperasse.',
  },
];

export default function FeaturesShowcase() {
  return (
    <section className="bg-neutral-50 dark:bg-neutral-900 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-4 text-center font-[family-name:var(--font-sora)] text-3xl font-bold text-neutral-900 dark:text-white sm:text-4xl">
          Pas juste un outil. Un écosystème.
        </h2>
        <p className="mb-16 text-center text-base text-neutral-500 dark:text-neutral-400">
          Tout ce qu{"'"}il faut pour gérer votre cuisine, votre salle et vos comptes.
        </p>

        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-6 transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                  <Icon className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-neutral-900 dark:text-white">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
