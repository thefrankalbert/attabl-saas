import Link from 'next/link';
import { Utensils, MonitorCheck, BookOpen } from 'lucide-react';

export default function RestaurantsPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-20 lg:py-28 bg-white dark:bg-neutral-950">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-[family-name:var(--font-sora)] text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 dark:text-white tracking-tight">
            Votre salle. Votre cuisine. Tout connecté.
          </h1>
          <p className="text-lg sm:text-xl text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto mt-6">
            {"De la commande à l'assiette, plus rien ne se perd."}
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
              className="border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white rounded-lg px-8 py-4 text-base font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              Voir les tarifs
            </Link>
          </div>
        </div>
      </section>

      {/* Features - 3 cards */}
      <section className="py-20 bg-neutral-50 dark:bg-neutral-900">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Utensils,
                title: 'Votre carte, numérisée',
                description:
                  'Catégories, sous-catégories, allergènes, photos. Vos clients consultent tout depuis leur téléphone.',
              },
              {
                icon: MonitorCheck,
                title: 'La cuisine voit tout',
                description:
                  'Entrées, plats, desserts - chaque station reçoit ses commandes au bon moment. Plus besoin de crier.',
              },
              {
                icon: BookOpen,
                title: 'Vos recettes, vos marges',
                description:
                  'Ingrédients, proportions, coût matière. Vous savez exactement combien vous gagnez par plat.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-8"
              >
                <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center mb-5">
                  <feature.icon className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
                  {feature.title}
                </h3>
                <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-white dark:bg-neutral-950">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-[family-name:var(--font-sora)] text-3xl sm:text-4xl font-bold text-neutral-900 dark:text-white">
            Votre restaurant mérite un service sans faille.
          </h2>
          <p className="text-lg text-neutral-500 dark:text-neutral-400 mt-4">
            Essayez gratuitement.
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
