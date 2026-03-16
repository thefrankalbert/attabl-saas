import Link from 'next/link';
import { BookOpen, Package, Truck } from 'lucide-react';

export default function BoulangeriesPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-[family-name:var(--font-sora)] text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 tracking-tight">
            Artisanat et précision
          </h1>
          <p className="text-lg sm:text-xl text-neutral-500 max-w-2xl mx-auto mt-6">
            Fiches techniques, stock automatique, suivi fournisseurs.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <Link
              href="/signup"
              className="bg-neutral-900 text-white rounded-lg px-8 py-4 text-base font-semibold hover:bg-neutral-800 transition-colors"
            >
              Démarrer gratuitement
            </Link>
            <Link
              href="/pricing"
              className="border border-neutral-300 text-neutral-900 rounded-lg px-8 py-4 text-base font-semibold hover:bg-neutral-50 transition-colors"
            >
              Voir les tarifs
            </Link>
          </div>
        </div>
      </section>

      {/* Features - 3 cards */}
      <section className="py-20 bg-neutral-50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: BookOpen,
                title: 'Fiches techniques',
                description:
                  'Définissez vos recettes au gramme près : farine T65, levure, sel. Calculez le coût matière exact de chaque production.',
              },
              {
                icon: Package,
                title: 'Stock automatique',
                description:
                  "Chaque vente déduit automatiquement les ingrédients utilisés. Vous savez en temps réel ce qu'il vous reste en stock.",
              },
              {
                icon: Truck,
                title: 'Suivi fournisseurs',
                description:
                  'Enregistrez vos achats et livraisons. Historique complet par fournisseur avec prix et quantités pour optimiser vos commandes.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-white rounded-xl border border-neutral-200 p-8"
              >
                <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center mb-5">
                  <feature.icon className="h-5 w-5 text-neutral-700" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-3">{feature.title}</h3>
                <p className="text-neutral-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-[family-name:var(--font-sora)] text-3xl sm:text-4xl font-bold text-neutral-900">
            Prêt à digitaliser votre boulangerie ?
          </h2>
          <p className="text-lg text-neutral-500 mt-4">
            Essai gratuit 14 jours. Sans carte bancaire.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-neutral-900 text-white rounded-lg px-8 py-4 text-base font-semibold hover:bg-neutral-800 transition-colors mt-8"
          >
            Démarrer gratuitement
          </Link>
        </div>
      </section>
    </>
  );
}
